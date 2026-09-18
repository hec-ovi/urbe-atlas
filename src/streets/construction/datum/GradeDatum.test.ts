import { describe, expect, it } from 'vitest';
import type { Polygon, Polyline, StreetEdge, Vec2 } from '../../../../schema/blueprint';
import { difference, hasInteriorBeyondPrecision, intersection, union } from '../../../geom/clip';
import { coversSegment } from '../../../geom/polygon';
import { HIGHWAY_WIDTH } from '../../widths';
import { applyHighwayElevationProfiles, highwayEnvelopes, supportHighwayEnvelopes } from '../highway';
import type { HighwayEnvelope } from '../highway';
import { resolveStreetDesign } from '../Design';
import { StreetCorridors } from '../StreetCorridors';
import { StreetSections } from '../StreetSections';
import { GradeDatum } from './index';
import type { GradeDatumInput, GradeDatumPlan } from './index';
import { datumStreetDesign } from './fixtures/design';

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

/** Planner-assigned T of two avenues and a stem, opted into explicit side bands. */
function tJunction(explicit = true): GradeDatumInput {
  const positions: Vec2[] = [[20, 60], [60, 60], [100, 60], [60, 20]];
  const nodes = positions.map((position, index) => ({
    id: `n${index}`, position, edgeIds: index === 1 ? ['west', 'east', 'stem'] : [index === 0 ? 'west' : index === 2 ? 'east' : 'stem'],
  }));
  const sources = [
    { id: 'west', class: 'road' as const, from: 'n0', to: 'n1', path: [positions[0], positions[1]] },
    { id: 'east', class: 'road' as const, from: 'n1', to: 'n2', path: [positions[1], positions[2]] },
    { id: 'stem', class: 'street' as const, from: 'n3', to: 'n1', path: [positions[3], positions[1]] },
  ];
  const design = resolveStreetDesign(explicit ? {
    ...datumStreetDesign,
    sidewalkProfiles: [2, 4].map(paved => ({
      id: `paved-${paved}`, curb: 0.2, border: 0, furnishing: 0.5, walking: paved - 0.5, frontage: 0,
      edge: { curbRise: paved === 2 ? 0.2 : 0.3,
        gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' as const } } },
    })),
    sidewalkAssignments: [
      { district: 'residential', street: 'paved-2', road: 'paved-2' },
      { district: 'commercial', street: 'paved-4', road: 'paved-4' },
    ],
  } : datumStreetDesign);
  const planned = StreetSections.plan(sources, nodes, design, point => point[1] > 60 ? 'commercial' : 'residential');
  const edges: StreetEdge[] = planned.edges.map(street => ({
    ...street, districtIds: [], level: 5,
    elevationProfile: [{ distance: 0, level: 5 }, { distance: 20, level: 5 }, { distance: 40, level: 5 }],
  }));
  return {
    boundary: [[0, 0], [120, 0], [120, 120], [0, 120]],
    edges, structures: [], roadwayTop: 5, pedestrianTop: 5.15, groundFormat: 'side-bands-v1',
  };
}

/** The same at-grade street and elevated highway, with and without explicit left-side intervals. */
function sideFormats(): { legacy: GradeDatumInput; explicit: GradeDatumInput } {
  const path: StreetEdge['path'] = [[20, 50], [80, 50]];
  const source = { id: 'street', class: 'street' as const, from: 'a', to: 'b', path };
  const nodes = path.map((position, index) => ({ id: index ? 'b' : 'a', position, edgeIds: ['street'] }));
  const legacyPlan = StreetSections.plan([source], nodes, resolveStreetDesign(datumStreetDesign), () => 'residential');
  const explicitPlan = StreetSections.plan([source], nodes, resolveStreetDesign({
    ...datumStreetDesign,
    sidewalkProfiles: [{
      id: 'paved-two', curb: 0.2, border: 0, furnishing: 0.5, walking: 1.5, frontage: 0,
      edge: { curbRise: 0.2, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' } } },
    }],
  }), () => 'residential');
  const legacyStreet: StreetEdge = {
    ...legacyPlan.edges[0], districtIds: [], level: 0,
    elevationProfile: [{ distance: 0, level: 0 }, { distance: 60, level: 0 }],
  };
  const explicitStreet = structuredClone(legacyStreet);
  explicitStreet.crossSection!.sidewalks.left = explicitPlan.edges[0].crossSection!.sidewalks.left;
  explicitStreet.sidewalk.left = explicitPlan.edges[0].sidewalk.left;
  const highway: StreetEdge = {
    id: 'highway', class: 'highway', from: 'south', to: 'north', path: [[50, -20], [50, 120]],
    width: 15, sidewalk: { left: 0, right: 0 }, districtIds: [], level: 8,
    elevationProfile: [{ distance: 0, level: 8 }, { distance: 140, level: 8 }],
  };
  const legacy: GradeDatumInput = {
    boundary: rectangle(0, 0, 100, 100),
    edges: [legacyStreet, highway], roadwayTop: 0, pedestrianTop: 0.15,
    structures: [{
      edgeIds: [highway.id], path: highway.path, width: highway.width, level: 8, deckThickness: 1,
      ramps: { start: 0, end: 0 }, elevationProfile: highway.elevationProfile,
    }],
  };
  return { legacy, explicit: { ...legacy, edges: [explicitStreet, highway] } };
}

describe('grade-ground datum', () => {
  it('builds grade ground, land faces and frontage while an elevated projection stays clear', () => {
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
    const allGround = [...roadway(planned), ...planned.land.flatMap(face => face.polygons)];
    expect(hasInteriorBeyondPrecision(difference([planned.boundary], allGround))).toBe(false);
    expect(hasInteriorBeyondPrecision(difference(allGround, [planned.boundary]))).toBe(false);

    for (const frontage of planned.roadFrontage) {
      expect(frontage.spanIds.length).toBeGreaterThan(0);
      expect(frontage.path.every(point => point[0] > 0 && point[0] < 100 && point[1] > 0 && point[1] < 100)).toBe(true);
    }
    expect(planned.land.find(face => face.kind === 'outer-fringe')!.polygons.length).toBeGreaterThan(1);
    const faces = planned.land.flatMap(face => face.polygons);
    for (let index = 0; index < faces.length; index++) {
      expect(hasInteriorBeyondPrecision(intersection([faces[index]], faces.slice(index + 1)))).toBe(false);
    }
    const open = GradeDatum.plan(input([edge('e0', [[0, 20], [80, 20], [80, 80], [0, 80]])]));
    expect(open.land.every(face => face.kind === 'outer-fringe')).toBe(true);
    expect(contains(open.land.flatMap(face => face.polygons), [40, 50])).toBe(true);
    const inner = rectangle(40, 40, 60, 60).map((point, index, ring) =>
      edge(`inner${index}`, [point, ring[(index + 1) % ring.length]], { width: 2, sidewalk: { left: 1, right: 1 } }));
    const nested = GradeDatum.plan(input([...square(), ...inner]));
    const eligible = nested.land.filter(face => face.kind === 'street-enclosed');
    expect(eligible).toHaveLength(2);
    expect(eligible.filter(face => contains(face.polygons, [50, 50]))).toHaveLength(1);
    expect(hasInteriorBeyondPrecision(intersection(eligible[0].polygons, eligible[1].polygons))).toBe(false);
  });

  it('cuts flat source intervals at shared stations and answers the same roadway-only spans', () => {
    const bent = edge('e0', [[10, 50], [50, 50], [50, 90]], {
      level: 4, elevationProfile: [{ distance: 0, level: 0 }, { distance: 40, level: 0 }, { distance: 80, level: 4 }],
    });
    const plan = GradeDatum.plan(input([bent]));
    expect(plan.spans.map(span => span.elevation)).toEqual(['at-grade', 'off-grade']);
    expect(plan.spans[0].end).toEqual(plan.spans[1].start);
    expect(plan.grade.corridors.map(owner => owner.spanId))
      .toEqual(plan.spans.filter(span => span.elevation === 'at-grade').map(span => span.id));
    expect(contains(roadway(plan), [48, 48])).toBe(true);
    // The inclusive corridor keeps the complete sidewalk land the roadway leaves out.
    expect(contains(plan.grade.corridors.flatMap(owner => owner.polygons), [30, 54])).toBe(true);
    expect(contains(roadway(plan), [30, 54])).toBe(false);
    expect(contains(plan.grade.full, [52, 52])).toBe(false);
    expect(contains(plan.grade.corridors.flatMap(owner => owner.polygons), [52, 52])).toBe(false);
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

    const mixed = edge('mixed', [[-10, 40], [50, 40], [50, 100]], {
      level: 4, sidewalk: { left: 3, right: 8.5 }, elevationProfile: [
        { distance: 0, level: 0 }, { distance: 20, level: 0 }, { distance: 40, level: 4 },
        { distance: 80, level: 0 }, { distance: 120, level: 0 },
      ],
    });
    const raised = edge('raised', [[20, 10], [80, 10]], {
      level: 4, elevationProfile: [{ distance: 0, level: 4 }, { distance: 60, level: 4 }],
    });
    const classOnly = edge('h0', [[10, 10], [90, 10]], {
      class: 'highway', width: HIGHWAY_WIDTH, sidewalk: { left: 0, right: 0 },
    });
    const request = input([mixed, raised, edge('alley', [[20, 80], [40, 80]], { class: 'alley', width: 0 }), classOnly]);
    const snapshot = JSON.stringify(request);
    const full = GradeDatum.plan(request);
    const lightweight = GradeDatum.roadwayPlan(request);
    expect(lightweight).toEqual({ spans: full.spans, roadway: full.grade.roadway });
    expect(lightweight.roadway.map(owner => owner.spanId)).toEqual(['gs:mixed:0', 'gs:mixed:3', 'gs:h0:0']);
    const polygons = lightweight.roadway.flatMap(owner => owner.polygons);
    expect(contains(polygons, [5, 40])).toBe(true);
    expect(contains(polygons, [50, 80])).toBe(true);
    expect(contains(polygons, [50, 10])).toBe(true);
    expect(contains(polygons, [40, 40])).toBe(false);
    expect(contains(polygons, [-5, 40])).toBe(false);
    expect(contains(polygons, [50, 103])).toBe(false);
    expect(JSON.stringify(request)).toBe(snapshot);
  });

  it('queries real ramp and support clearance and the physical-only plan, including explicit sides', () => {
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
    const physical = GradeDatum.physicalPlan({ boundary: plan.boundary, edges: [highway], structures: envelopes });
    expect(physical.physical).toEqual(plan.physical.map(({ spanIds: _spanIds, ...owner }) => owner));
    expect(GradeDatum.clearanceFootprints({ plan: physical, supports, groundTop: 0, clearHeight: 2 })).toEqual(supported);
    expect(supported.filter(region => region.source.kind === 'support')).toHaveLength(supports.length);
    expect(JSON.stringify(plan)).toBe(snapshot);
    expect(roadway(plan)).toEqual([]);
    expect(hasInteriorBeyondPrecision(difference(union(clearance.flatMap(region => region.polygons)),
      plan.projected.structures.flatMap(owner => owner.polygons)))).toBe(false);

    const { legacy, explicit } = sideFormats();
    const authored = JSON.stringify(explicit);
    const explicitRoadway = GradeDatum.roadwayPlan(explicit);
    const explicitPhysical = GradeDatum.physicalPlan(explicit);
    expect(explicitRoadway.roadway.length).toBeGreaterThan(0);
    expect(explicitPhysical.physical.length).toBeGreaterThan(0);
    expect(explicitRoadway).toEqual(GradeDatum.roadwayPlan(legacy));
    expect(explicitPhysical).toEqual(GradeDatum.physicalPlan(legacy));
    expect(JSON.stringify(explicit)).toBe(authored);
  });

  it('publishes explicit side-band role masks and keeps curb-only pedestrian rows separate', () => {
    const request = tJunction();
    const saved = JSON.stringify(request);
    const expected = request.edges.flatMap(street => (['left', 'right'] as const).flatMap(side =>
      street.crossSection!.sidewalks[side].geometry!.intervals.map(interval => ({
        edgeId: street.id, spanIds: [`gs:${street.id}:0`, `gs:${street.id}:1`], side,
        role: interval.role, top: request.roadwayTop + interval.top,
        masks: StreetCorridors.band(street, side, interval.role),
      }))));
    const plan = GradeDatum.plan(request);
    expect(request.edges.map(street => street.width)).toEqual([14, 14, 7]);
    expect(request.edges[0].sidewalk.left).not.toBe(request.edges[0].sidewalk.right);
    expect(plan.groundFormat).toBe('side-bands-v1');
    expect(JSON.stringify(plan.grade.sideBands)).toBe(JSON.stringify(expected));
    expect(plan.grade.pedestrian).toEqual([]);
    expect(plan.grade.sideBands!.filter(row => row.role === 'walking').map(row => row.top))
      .toEqual([5.3, 5.2, 5.3, 5.2, 5.2, 5.2]);
    expect(plan.grade.sideBands!.filter(row => row.role === 'frontage').every(row => row.masks.length === 0)).toBe(true);
    expect(plan.grade.full.some(polygon => coversSegment(polygon, [40, 70], [40, 70]))).toBe(true);
    expect(JSON.stringify(GradeDatum.plan(request))).toBe(JSON.stringify(plan));
    expect(JSON.stringify(request)).toBe(saved);

    const legacy = tJunction(false);
    const { groundFormat: _format, ...curbOnly } = legacy;
    const old = GradeDatum.plan(curbOnly);
    const opted = GradeDatum.plan(legacy);
    const { groundFormat: _outputFormat, grade: { sideBands, ...grade }, ...rest } = opted;
    expect(sideBands).toEqual([]);
    expect({ ...rest, grade }).toEqual(old);
    const modern = tJunction();
    modern.edges[0] = legacy.edges[0];
    const mixed = GradeDatum.plan(modern);
    expect(mixed.grade.sideBands!.every(row => row.edgeId !== 'west')).toBe(true);
    expect(mixed.grade.pedestrian.length).toBeGreaterThan(0);
    expect(mixed.grade.pedestrian.every(row => row.spanId.startsWith('gs:west:'))).toBe(true);
  });

  it('rejects invalid datums, unsupported sides and inconsistent structure ownership', () => {
    expect(() => GradeDatum.plan({ ...input([]), roadwayTop: NaN }))
      .toThrow(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    const repeated = edge('duplicate', [[10, 10], [20, 10]]);
    expect(() => GradeDatum.roadwayPlan(input([repeated, repeated])))
      .toThrow(expect.objectContaining({ code: 'E_INVARIANT' }));
    expect(() => GradeDatum.plan(input([edge('e0', [[10, 10], [20, 10]], { elevationProfile: [] })])))
      .toThrow(expect.objectContaining({ code: 'E_INVARIANT' }));
    expect(() => GradeDatum.physicalPlan({ boundary: rectangle(0, 0, 100, 100), edges: [], structures: [{
      edgeIds: ['missing'], path: [[0, 50], [100, 50]], width: 15, level: 8, deckThickness: 1,
      ramps: { start: 0, end: 0 }, elevationProfile: [{ distance: 0, level: 8 }, { distance: 100, level: 8 }],
    }] })).toThrow(expect.objectContaining({ code: 'E_INVARIANT' }));
    const plan = GradeDatum.plan(input([]));
    expect(() => GradeDatum.clearanceFootprints({ plan, supports: [], groundTop: 0, clearHeight: -1 }))
      .toThrow(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    expect(() => GradeDatum.clearanceFootprints({ plan, groundTop: 0, clearHeight: 2,
      supports: [{ structureEdgeIds: ['missing'], support: {
        position: [50, 50], footprint: rectangle(49, 49, 51, 51), bottom: 0, top: 7,
      } }] })).toThrow(expect.objectContaining({ code: 'E_INVARIANT' }));

    const { explicit } = sideFormats();
    const authored = JSON.stringify(explicit);
    expect(() => GradeDatum.plan(explicit)).toThrowError(expect.objectContaining({
      code: 'E_INVARIANT', message: 'grade datum requires curb-only sidewalk sections',
      details: { edgeId: 'street', side: 'left', version: '1.0.0' },
    }));
    expect(JSON.stringify(explicit)).toBe(authored);
    expect(() => GradeDatum.plan({ ...tJunction(), groundFormat: 'future' as never }))
      .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));

    const excursion = tJunction();
    excursion.boundary = [[0, 0], [120, 0], [120, 120], [35, 120], [35, 70], [30, 70], [30, 120], [0, 120]];
    const side = StreetCorridors.sidewalk(excursion.edges[0], 'left');
    expect(side.flat().every(point => coversSegment(excursion.boundary, point, point))).toBe(true);
    expect(() => GradeDatum.plan(excursion)).toThrowError(expect.objectContaining({
      code: 'E_INVARIANT', message: 'datum explicit side leaves the city domain',
      details: expect.objectContaining({ edgeId: 'west', side: 'left', mask: side[0] }),
    }));
    const stepped = tJunction();
    stepped.edges[0].elevationProfile[2].level = 6;
    expect(() => GradeDatum.plan(stepped)).toThrowError(expect.objectContaining({
      code: 'E_INVARIANT', message: 'datum explicit side requires a wholly flat source at the roadway datum',
      details: expect.objectContaining({ edgeId: 'west', side: 'left', spanIds: ['gs:west:1'] }),
    }));
    const future = tJunction();
    future.edges[0].crossSection!.sidewalks.left.geometry!.version = 'future' as never;
    expect(() => GradeDatum.plan(future)).toThrowError(expect.objectContaining({
      code: 'E_INVARIANT', message: 'datum side geometry version is unsupported',
      details: { edgeId: 'west', side: 'left', version: 'future' },
    }));
  });
});
