import { expect, it } from 'vitest';
import type { CityBlueprint, Polygon, Vec2 } from '../../schema/blueprint';
import { Rng } from '../core/rng';
import { pointInPolygon, distanceToOutline, area } from '../geom/polygon';
import { difference, intersection } from '../geom/clip';
import { length as pathLength } from '../geom/polyline';
import { StreetCorridors } from '../streets/construction/StreetCorridors';
import { StreetSections } from '../streets/construction/StreetSections';
import { resolveStreetDesign } from '../streets/construction/Design';
import type { SectionedStreetEdge } from '../streets/construction/schema/sections';
import type { BuiltEdge, BuiltNode } from '../streets/Graph';
import { TransitPlanner } from './TransitPlanner';
import type { SubwayOptions, SubwayPlan } from './schema';
import { validateStationEntrances } from './reservations/validateStationEntrances';
import type { StationEntranceState } from './reservations/schema';
import { EntranceBays } from './reservations/EntranceBays';
import { platformOf, rectangle, STATION } from './stations';

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
    transit: plan,
    volumetric: { ground: plan.subwayStations.flatMap((station) => station.entranceBays!.map((bay) => ({
      polygon: bay.footprint, surface: 'sidewalk', bottom: 0, top: 0.15,
    }))) },
  };
}

function street(path: Vec2[] = [[0, 0], [120, 0]]): SectionedStreetEdge {
  return StreetSections.plan([{ id: 'e0', class: 'street', from: 'n0', to: 'n1', path }], [
    { id: 'n0', position: path[0], edgeIds: ['e0'] },
    { id: 'n1', position: path[path.length - 1], edgeIds: ['e0'] },
  ], resolveStreetDesign(), ([, z]) => z > 0 ? 'residential' : 'commercial').edges[0];
}

const size = (polygons: Polygon[]): number => polygons.reduce((sum, polygon) => sum + area(polygon), 0);

it('fits full terminal platforms, shares deterministic identities and publishes validated entrance land', () => {
  const { planner, options, edges } = fixture();
  const plan = planner.planSubway(options);
  expect(plan.subwayDemand).toEqual({ populationEstimate: 1_000_000, lineTarget: 4 });
  expect(plan.subwayLines).toHaveLength(plan.subwayDemand!.lineTarget);
  expect(new Set(plan.subwayLines.map((line) => line.id)).size).toBe(plan.subwayLines.length);
  expect(new Set(plan.subwayStations.map((station) => station.id)).size).toBe(plan.subwayStations.length);
  const served = new Set(plan.subwayLines.flatMap((line) => line.stationIds));
  expect(plan.subwayStations.every((station) => served.has(station.id))).toBe(true);
  for (const line of plan.subwayLines) {
    expect(line.stationIds.length).toBeGreaterThanOrEqual(2);
    expect(new Set(line.stationIds).size).toBe(line.stationIds.length);
    expect(pathLength(line.path)).toBeGreaterThanOrEqual(280);
    for (const [id, point] of [[line.stationIds[0], line.path[0]], [line.stationIds.at(-1)!, line.path.at(-1)!]] as [string, Vec2][]) {
      const platform = plan.subwayStations.find((station) => station.id === id)!.platform;
      expect(pointInPolygon(point, platform) || distanceToOutline(point, platform) <= 1e-6).toBe(true);
    }
  }
  const repeated = fixture();
  expect(repeated.planner.planSubway(repeated.options)).toEqual(plan);

  const state = reservationState(plan, edges, options.boundary);
  expect(() => validateStationEntrances(state)).not.toThrow();
  state.parcels.push({ lot: state.transit.subwayStations[0].entranceBays![0].footprint });
  expect(() => validateStationEntrances(state))
    .toThrowError(expect.objectContaining({ code: 'E_INVARIANT', message: expect.stringContaining('overlaps a parcel') }));
});

it('reports impossible platform capacity, unavailable bay land and invalid demand without dropping stations', () => {
  const short = fixture(120);
  expect(() => short.planner.planSubway(short.options)).toThrowError(expect.objectContaining({ code: 'E_UNSATISFIABLE' }));
  const city = fixture();
  expect(() => city.planner.planSubway({ ...city.options, entranceObstacles: [city.options.boundary] }))
    .toThrowError(expect.objectContaining({ code: 'E_UNSATISFIABLE' }));
  expect(() => city.planner.planSubway({ ...city.options, populationEstimate: NaN }))
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
    expect(size(intersection([station.platform], [water]))).toBe(0);
  }
});

it('reserves whole outboard stair bays beside each walking band and reports unavailable land', () => {
  const edge = street();
  const boundary: Polygon = [[-30, -50], [150, -50], [150, 60], [-30, 60]];
  const straight = { edges: [edge], boundary, obstacles: [] };
  const platform = platformOf([60, 0], [1, 0]);
  const places = new EntranceBays(straight).find([60, 0], platform);
  expect(places).toHaveLength(2);
  expect(places.map((place) => place.bay.side)).toEqual(['left', 'right']);
  expect(edge.sidewalk).toEqual({ left: 2.5, right: 6.5 });
  const corridors = new StreetCorridors([edge]);
  for (const place of places) {
    expect(area(place.bay.shaft)).toBeCloseTo(STATION.shaft.length * STATION.shaft.width, 6);
    expect(size(intersection([place.bay.shaft], corridors.full))).toBe(0);
    expect(size(difference([place.bay.footprint], [boundary]))).toBe(0);
    expect(place.bay.approach.at(-1)).toEqual(place.point);
    expect(StreetCorridors.band(edge, place.bay.side, 'walking')
      .some((polygon) => pointInPolygon(place.bay.approach[0], polygon))).toBe(true);
    expect(size(intersection([place.bay.footprint], StreetCorridors.band(edge, place.bay.side, 'walking')))).toBeGreaterThan(0);
  }
  expect(new EntranceBays(straight).find([60, 0], platform)).toEqual(places);

  const bent = street([[0, 0], [50, 0], [85, 25], [120, 25]]);
  const cross = { ...street([[60, -50], [60, 50]]), id: 'e1' };
  const water = rectangle([100, -20], [1, 0], 40, 30);
  const planner = new EntranceBays({ edges: [bent, cross], boundary, obstacles: [water] });
  const junction = platformOf([60, 10], [1, 0]);
  const first = planner.find([60, 10], junction);
  expect(first.length).toBeGreaterThan(0);
  planner.reserve(first.map((place) => place.bay));
  const second = planner.find([60, 10], junction);
  expect(second.length).toBeGreaterThan(0);
  const unavailable = [...new StreetCorridors([bent, cross]).roadway.values()].flat();
  for (const place of [...first, ...second]) {
    expect(size(intersection([place.bay.footprint], [...unavailable, water]))).toBe(0);
    expect(size(difference([place.bay.footprint], [boundary]))).toBe(0);
  }
  expect(size(intersection(first.map((place) => place.bay.footprint), second.map((place) => place.bay.footprint)))).toBe(0);
  expect(new EntranceBays({ edges: [edge], boundary, obstacles: [boundary] }).find([60, 0], platform)).toEqual([]);
});
