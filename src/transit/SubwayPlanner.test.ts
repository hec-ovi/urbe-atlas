import { describe, expect, it } from 'vitest';
import type { CityBlueprint, Polygon, Vec2 } from '../../schema/blueprint';
import { Rng } from '../core/rng';
import { pointInPolygon, distanceToOutline, area } from '../geom/polygon';
import { intersection } from '../geom/clip';
import { length as pathLength } from '../geom/polyline';
import { StreetSections } from '../streets/construction/StreetSections';
import { resolveStreetDesign } from '../streets/construction/Design';
import type { BuiltEdge, BuiltNode } from '../streets/Graph';
import { TransitPlanner } from './TransitPlanner';
import type { SubwayOptions, SubwayPlan } from './schema';
import { validateStationEntrances } from './reservations/validateStationEntrances';
import type { StationEntranceState } from './reservations/schema';
import { rectangle } from './stations';

function fixture(width = 600): { planner: TransitPlanner; options: SubwayOptions; edges: CityBlueprint['streets']['edges'] } {
  const points: Vec2[] = [[0, 0], [width / 3, 0], [width * 2 / 3, 0], [width, 0]];
  const edges: BuiltEdge[] = points.slice(1).map((end, i) => ({ id: `e${i}`, class: 'street', from: `n${i}`, to: `n${i + 1}`, path: [points[i], end] }));
  const nodes: BuiltNode[] = points.map((position, i) => ({ id: `n${i}`, position, edgeIds: edges.filter((edge) => edge.from === `n${i}` || edge.to === `n${i}`).map((edge) => edge.id) }));
  const sections = StreetSections.plan(edges, nodes, resolveStreetDesign(), () => 'residential').edges;
  for (const edge of sections) edge.elevationProfile = [{ distance: 0, level: 0 }, { distance: pathLength(edge.path), level: 0 }];
  const boundary: Polygon = [[-30, -80], [width + 30, -80], [width + 30, 80], [-30, 80]];
  const districts = [0, 1].map((index) => ({ index, kind: 'residential' as const, tier: 'poor' as const,
    center: [width / 2, 0] as Vec2, radius: width / 2, maxFloors: 4 }));
  return {
    planner: new TransitPlanner(nodes, sections), edges: sections,
    options: { districts, districtOfNode: () => 0, cityCenter: [width / 2, 0], boundary,
      populationEstimate: 1_000_000, entranceObstacles: [], rng: Rng.from('subway-bays', 'transit') },
  };
}

function reservationState(plan: SubwayPlan, edges: CityBlueprint['streets']['edges'], boundary: Polygon): StationEntranceState {
  return {
    meta: { boundary }, streets: { edges }, parcels: [],
    transit: { ...plan, trainStations: [] },
    volumetric: { ground: plan.subwayStations.flatMap((station) => station.entranceBays!.map((bay) => ({
      polygon: bay.footprint, surface: 'sidewalk', bottom: 0, top: 0.15,
    }))) },
  };
}

describe('pre-parcel subway service', () => {
  it('fits full terminal platforms, shares station identities and retains early service when final population changes', () => {
    const { planner, options, edges } = fixture();
    const early = planner.planSubway(options);
    expect(early.subwayDemand).toEqual({ populationEstimate: 1_000_000, lineTarget: 4 });
    expect(early.subwayLines.length).toBeGreaterThan(0);
    expect(early.subwayLines.length).toBe(early.subwayDemand!.lineTarget);
    expect(new Set(early.subwayLines.map((line) => line.id)).size).toBe(early.subwayLines.length);
    expect(new Set(early.subwayStations.map((station) => station.id)).size).toBe(early.subwayStations.length);
    for (const line of early.subwayLines) {
      expect(line.stationIds.length).toBeGreaterThanOrEqual(2);
      expect(new Set(line.stationIds).size).toBe(line.stationIds.length);
      expect(pathLength(line.path)).toBeGreaterThanOrEqual(280);
      for (const [id, point] of [[line.stationIds[0], line.path[0]], [line.stationIds.at(-1)!, line.path.at(-1)!]] as [string, Vec2][]) {
        const platform = early.subwayStations.find((station) => station.id === id)!.platform;
        expect(pointInPolygon(point, platform) || distanceToOutline(point, platform) <= 1e-6).toBe(true);
      }
    }
    const output = reservationState(early, edges, options.boundary);
    expect(() => validateStationEntrances(output)).not.toThrow();
    const final = planner.plan({ ...options, population: 12, features: { trains: false, subways: true }, subwayPlan: early });
    expect(final.subwayStations).toBe(early.subwayStations);
    expect(final.subwayLines).toBe(early.subwayLines);
    expect(final.subwayDemand).toBe(early.subwayDemand);
    const repeated = fixture();
    expect(repeated.planner.planSubway(repeated.options)).toEqual(early);
  });

  it('reports impossible fixed platform capacity, unavailable bay land and invalid demand without dropping stations', () => {
    const short = fixture(120);
    expect(() => short.planner.planSubway(short.options)).toThrowError(expect.objectContaining({ code: 'E_UNSATISFIABLE' }));
    const city = fixture();
    expect(() => city.planner.planSubway({ ...city.options, entranceObstacles: [city.options.boundary] }))
      .toThrowError(expect.objectContaining({ code: 'E_UNSATISFIABLE' }));
    expect(() => city.planner.planSubway({ ...city.options, populationEstimate: NaN }))
      .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    expect(() => city.planner.plan({ ...city.options, population: 12, features: { trains: false, subways: true } }))
      .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    expect(() => city.planner.plan({ ...city.options, population: 12, features: { trains: true, subways: false } }))
      .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  });

  it('selects land terminals when a sampled endpoint is on a water crossing', () => {
    const dry = fixture();
    const intended = dry.planner.planSubway({ ...dry.options, populationEstimate: 0 });
    const water = rectangle(intended.subwayLines[0].path.at(-1)!, [1, 0], 30, 30);
    const wet = fixture();
    const plan = wet.planner.planSubway({ ...wet.options, populationEstimate: 0, entranceObstacles: [water], stationExclusion: [water] });
    expect(plan.subwayLines).toHaveLength(1);
    expect(plan.subwayStations.length).toBeGreaterThanOrEqual(2);
    for (const station of plan.subwayStations) {
      expect(intersection([station.platform], [water]).reduce((sum, polygon) => sum + area(polygon), 0)).toBe(0);
    }
  });

  it('rejects a bay that consumes parcel land through the published reservation gate', () => {
    const city = fixture();
    const output = reservationState(city.planner.planSubway(city.options), city.edges, city.options.boundary);
    output.parcels.push({ lot: output.transit.subwayStations[0].entranceBays![0].footprint });
    expect(() => validateStationEntrances(output)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT', message: expect.stringContaining('overlaps a parcel') }));
  });

});
