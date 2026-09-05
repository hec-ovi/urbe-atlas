import { describe, expect, it } from 'vitest';
import type { Polygon, Polyline, StreetEdge, Vec2 } from '../../../../schema/blueprint';
import { difference, hasInteriorBeyondPrecision, intersection, union } from '../../../geom/clip';
import { coversSegment } from '../../../geom/polygon';
import { HIGHWAY_WIDTH } from '../../widths';
import { applyHighwayElevationProfiles, highwayEnvelopes, supportHighwayEnvelopes } from '../highway';
import type { HighwayEnvelope } from '../highway';
import { GradeDatum } from './index';
import type { GradeDatumInput, GradeDatumPlan } from './index';

const rectangle = (left: number, bottom: number, right: number, top: number): Polygon =>
  [[left, bottom], [right, bottom], [right, top], [left, top]];

function edge(id: string, path: Polyline, overrides: Partial<StreetEdge> = {}): StreetEdge {
  const length = path.slice(1).reduce((sum, point, index) =>
    sum + Math.hypot(point[0] - path[index][0], point[1] - path[index][1]), 0);
  return {
    id, class: 'street', from: `n:${path[0]}`, to: `n:${path[path.length - 1]}`, path,
    width: 7, sidewalk: { left: 3, right: 3 }, level: 0, districtIds: [],
    elevationProfile: [{ distance: 0, level: 0 }, { distance: length, level: 0 }], ...overrides,
  };
}

const input = (edges: StreetEdge[], structures: HighwayEnvelope[] = []): GradeDatumInput => ({
  boundary: rectangle(0, 0, 100, 100), edges, structures, roadwayTop: 0, pedestrianTop: 0.15,
});
const contains = (polygons: Polygon[], point: Vec2): boolean => polygons.some(polygon => coversSegment(polygon, point, point));
const roadway = (plan: GradeDatumPlan): Polygon[] => plan.grade.roadway.flatMap(owner => owner.polygons);

function square(): StreetEdge[] {
  const points: Vec2[] = [[20, 20], [50, 20], [80, 20], [80, 80], [50, 80], [20, 80]];
  return points.map((point, index) => edge(`e${index}`, [point, points[(index + 1) % points.length]]));
}

describe('grade-ground datum', () => {
  it('keeps an elevated projection out of grade paving, faces and curbs', () => {
    const streets = square();
    const base = GradeDatum.plan(input(streets));
    const points: Vec2[] = [[50, -20], [50, 20], [50, 80], [50, 120]];
    const elevated = points.slice(1).map((point, index) => edge(`h${index}`, [points[index], point], {
      class: 'highway', width: HIGHWAY_WIDTH, sidewalk: { left: 0, right: 0 }, level: 8,
      elevationProfile: [{ distance: 0, level: 8 }, { distance: point[1] - points[index][1], level: 8 }],
    }));
    const structure: HighwayEnvelope = {
      edgeIds: elevated.map(item => item.id), path: points, width: HIGHWAY_WIDTH,
      level: 8, deckThickness: 1, ramps: { start: 0, end: 0 },
      elevationProfile: [{ distance: 0, level: 8 }, { distance: 140, level: 8 }],
    };
    const planned = GradeDatum.plan(input([...streets, ...elevated], [structure]));
    expect(planned.grade).toEqual(base.grade);
    expect(planned.land).toEqual(base.land);
    expect(planned.roadFrontage).toEqual(base.roadFrontage);
    expect(contains(planned.projected.structures.flatMap(owner => owner.polygons), [50, 50])).toBe(true);
    expect(contains(roadway(planned), [50, 50])).toBe(false);
    expect(contains(planned.grade.pedestrian.flatMap(owner => owner.polygons), [50, 25])).toBe(true);
    expect(planned.land.filter(face => face.kind === 'street-enclosed')).toHaveLength(1);
    const allGround = [...roadway(planned), ...planned.land.flatMap(face => face.polygons)];
    expect(hasInteriorBeyondPrecision(difference([planned.boundary], allGround))).toBe(false);
    expect(hasInteriorBeyondPrecision(difference(allGround, [planned.boundary]))).toBe(false);
  });

  it('cuts a flat source interval at the shared bent station without a rounded cap', () => {
    const bent = edge('e0', [[10, 50], [50, 50], [50, 90]], {
      level: 4, elevationProfile: [{ distance: 0, level: 0 }, { distance: 40, level: 0 }, { distance: 80, level: 4 }],
    });
    const plan = GradeDatum.plan(input([bent]));
    expect(plan.spans.map(span => span.elevation)).toEqual(['at-grade', 'off-grade']);
    expect(plan.spans[0].end).toEqual(plan.spans[1].start);
    expect(contains(roadway(plan), [48, 48])).toBe(true);
    expect(contains(plan.grade.full, [52, 52])).toBe(false);
    expect(plan.roadFrontage.some(frontage => frontage.kind === 'elevation-transition')).toBe(true);
    const flat = { ...bent, level: 0, sidewalk: { left: 3, right: 6.5 },
      elevationProfile: bent.elevationProfile.map(knot => ({ ...knot, level: 0 })) };
    const partitioned = GradeDatum.plan(input([flat]));
    const whole = GradeDatum.plan(input([{ ...flat,
      elevationProfile: [flat.elevationProfile[0], flat.elevationProfile[2]] }]));
    expect(hasInteriorBeyondPrecision(difference(partitioned.grade.full, whole.grade.full))).toBe(false);
    expect(hasInteriorBeyondPrecision(difference(whole.grade.full, partitioned.grade.full))).toBe(false);
    expect(hasInteriorBeyondPrecision(intersection(partitioned.grade.roadway[0].polygons,
      partitioned.grade.roadway[1].polygons))).toBe(false);
    const classOnly = edge('h0', [[10, 10], [90, 10]], {
      class: 'highway', width: HIGHWAY_WIDTH, sidewalk: { left: 0, right: 0 },
    });
    expect(contains(roadway(GradeDatum.plan(input([classOnly]))), [50, 10])).toBe(true);
  });

  it('keeps boundary-closed regions in the outer fringe and removes partition-cut frontage', () => {
    const open = GradeDatum.plan(input([edge('e0', [[0, 20], [80, 20], [80, 80], [0, 80]])]));
    expect(open.land.every(face => face.kind === 'outer-fringe')).toBe(true);
    expect(contains(open.land.flatMap(face => face.polygons), [40, 50])).toBe(true);
    const closed = GradeDatum.plan(input(square()));
    expect(closed.land.find(face => face.kind === 'outer-fringe')!.polygons.length).toBeGreaterThan(1);
    for (const frontage of closed.roadFrontage) {
      expect(frontage.spanIds.length).toBeGreaterThan(0);
      expect(frontage.path.every(point => point[0] > 0 && point[0] < 100 && point[1] > 0 && point[1] < 100)).toBe(true);
    }
    const faces = closed.land.flatMap(face => face.polygons);
    for (let index = 0; index < faces.length; index++) {
      expect(hasInteriorBeyondPrecision(intersection([faces[index]], faces.slice(index + 1)))).toBe(false);
    }
    const inner = rectangle(40, 40, 60, 60).map((point, index, points) =>
      edge(`inner${index}`, [point, points[(index + 1) % points.length]], { width: 2, sidewalk: { left: 1, right: 1 } }));
    const nested = GradeDatum.plan(input([...square(), ...inner]));
    const eligible = nested.land.filter(face => face.kind === 'street-enclosed');
    expect(eligible).toHaveLength(2);
    expect(eligible.filter(face => contains(face.polygons, [50, 50]))).toHaveLength(1);
    expect(hasInteriorBeyondPrecision(intersection(eligible[0].polygons, eligible[1].polygons))).toBe(false);
  });

  it('queries real ramp and support clearance independently of projected land', () => {
    const highway = edge('h0', [[0, 50], [240, 50]], {
      class: 'highway', width: HIGHWAY_WIDTH, sidewalk: { left: 0, right: 0 }, level: 8,
    });
    applyHighwayElevationProfiles([highway]);
    const envelopes = highwayEnvelopes([highway]);
    const plan = GradeDatum.plan({ ...input([highway], envelopes), boundary: rectangle(-10, -10, 250, 110) });
    const snapshot = JSON.stringify(plan);
    const contact = GradeDatum.clearanceFootprints({ plan, supports: [], groundTop: 0, clearHeight: 0 });
    const clearance = GradeDatum.clearanceFootprints({ plan, supports: [], groundTop: 0, clearHeight: 2 });
    expect(contains(contact.flatMap(region => region.polygons), [5, 50])).toBe(true);
    expect(contains(contact.flatMap(region => region.polygons), [10, 50])).toBe(false);
    expect(contains(clearance.flatMap(region => region.polygons), [10, 50])).toBe(true);
    expect(contains(clearance.flatMap(region => region.polygons), [120, 50])).toBe(false);
    expect(contains(plan.projected.structures.flatMap(owner => owner.polygons), [120, 50])).toBe(true);
    const completed = supportHighwayEnvelopes(envelopes);
    const supports = completed.flatMap(structure => structure.supports.map(support => ({ structureEdgeIds: structure.edgeIds, support })));
    const supported = GradeDatum.clearanceFootprints({ plan, supports, groundTop: 0, clearHeight: 2 });
    expect(supported.filter(region => region.source.kind === 'support')).toHaveLength(supports.length);
    expect(JSON.stringify(plan)).toBe(snapshot);
    expect(roadway(plan)).toEqual([]);
    expect(hasInteriorBeyondPrecision(difference(union(clearance.flatMap(region => region.polygons)),
      plan.projected.structures.flatMap(owner => owner.polygons)))).toBe(false);
  });

  it('rejects invalid datums, incomplete source profiles and invalid clearance', () => {
    expect(() => GradeDatum.plan({ ...input([]), roadwayTop: NaN }))
      .toThrow(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    expect(() => GradeDatum.plan(input([edge('e0', [[10, 10], [20, 10]], { elevationProfile: [] })])))
      .toThrow(expect.objectContaining({ code: 'E_INVARIANT' }));
    const plan = GradeDatum.plan(input([]));
    expect(() => GradeDatum.clearanceFootprints({ plan, supports: [], groundTop: 0, clearHeight: -1 }))
      .toThrow(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    expect(() => GradeDatum.clearanceFootprints({ plan, groundTop: 0, clearHeight: 2,
      supports: [{ structureEdgeIds: ['missing'], support: {
        position: [50, 50], footprint: rectangle(49, 49, 51, 51), bottom: 0, top: 7,
      } }] })).toThrow(expect.objectContaining({ code: 'E_INVARIANT' }));
  });
});
