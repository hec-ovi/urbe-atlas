import { describe, expect, it } from 'vitest';
import type { GroundSurface, Polygon, StreetClass, StreetEdge, StreetNode, Vec2 } from '../../../schema/blueprint';
import { coordinateCover, difference, hasInteriorBeyondPrecision, union } from '../../geom/clip';
import { edgeMaskView } from '../../geom/partition/EdgeMasks';
import { StreetCorridors } from '../construction/StreetCorridors';
import { GradeDatum } from '../construction/datum';
import { CrossingPlanner } from './CrossingPlanner';
import { FootprintRegions } from './intervals/FootprintRegions';
import type { CrossingInput, CrossingPlan } from './schema';

interface EdgeSpec {
  id: string;
  from: string;
  to: string;
  kind?: StreetClass;
  width?: number;
  level?: number;
}

function fixture(positions: Record<string, Vec2>, specs: EdgeSpec[]): CrossingInput {
  const edges: StreetEdge[] = specs.map(spec => {
    const kind = spec.kind ?? 'street';
    const level = spec.level ?? 0;
    const width = kind === 'alley' ? 0 : (spec.width ?? 7);
    const sidewalk = kind === 'highway' ? 0 : kind === 'alley' ? 2 : 4;
    const path = [positions[spec.from], positions[spec.to]];
    const length = Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]);
    const bands = { curb: 0.15, border: 0.35, furnishing: 1, walking: 2, frontage: 0.5 };
    return {
      id: spec.id, class: kind, from: spec.from, to: spec.to, path, width,
      sidewalk: { left: sidewalk, right: sidewalk }, districtIds: [], level,
      elevationProfile: [{ distance: 0, level }, { distance: length, level }],
      ...(kind === 'street' || kind === 'road' ? { crossSection: {
        runId: `run-${spec.id}`, profileId: `road-${width}`,
        lanes: [{ direction: 'backward' as const, width: width / 2, offset: width / 4 },
          { direction: 'forward' as const, width: width / 2, offset: -width / 4 }],
        shoulders: { left: 0, right: 0 },
        sidewalks: { left: { profileId: 'walking', bands }, right: { profileId: 'walking', bands: { ...bands } } },
      } } : {}),
    };
  });
  const nodes: StreetNode[] = Object.entries(positions).map(([id, position]) => {
    const incident = edges.filter(edge => edge.from === id || edge.to === id);
    const levels = [...new Set(incident.map(edge => edge.level))].sort((a, b) => a - b);
    return { id, position, edgeIds: incident.map(edge => edge.id),
      connections: levels.map(level => ({ level, edgeIds: incident.filter(edge => edge.level === level).map(edge => edge.id) })) };
  });
  const reservations = StreetCorridors.reservations(edges);
  const grade = new Set(edges.filter(edge => edge.level === 0).map(edge => edge.id));
  const road = union(reservations.edges.filter(edge => grade.has(edge.edgeId)).flatMap(edge => edge.roadway));
  const pedestrian = difference(reservations.edges.filter(edge => grade.has(edge.edgeId)).flatMap(edge =>
    [...edge.sides.left.sidewalk, ...edge.sides.right.sidewalk]), road);
  const ground: GroundSurface[] = [
    ...road.map(polygon => ({ surface: 'roadway' as const, polygon, bottom: -0.2, top: 0 })),
    ...pedestrian.map(polygon => ({ surface: 'sidewalk' as const, polygon, bottom: 0, top: 0.15 })),
  ];
  return { nodes, edges, reservations, ground };
}

function sharpJunction(): CrossingInput {
  return fixture({ center: [0, 0], west: [-180, 0], east: [180, 0], branch: [160, 60] }, [
    { id: 'west-road', from: 'west', to: 'center', kind: 'road', width: 14 },
    { id: 'east-road', from: 'center', to: 'east', kind: 'road', width: 14 },
    { id: 'branch-street', from: 'center', to: 'branch' },
  ]);
}

function verifyPlan(input: CrossingInput, plan: CrossingPlan): void {
  const road = input.ground.filter(owner => owner.surface === 'roadway').map(owner => owner.polygon);
  const pedestrian = input.ground.filter(owner => owner.surface === 'curb' || owner.surface === 'sidewalk')
    .map(owner => owner.polygon);
  const allFields: Polygon[] = [];
  const approaches = plan.junctions.flatMap(junction => junction.approaches);
  const segments = plan.crossings.flatMap(crossing => crossing.segments.map(segment => ({ nodeId: crossing.nodeId, segment })));
  expect(segments).toHaveLength(approaches.length);
  for (const approach of approaches) {
    const edge = input.edges.find(candidate => candidate.id === approach.edgeId)!;
    const reservation = input.reservations.edges.find(candidate => candidate.edgeId === approach.edgeId)!;
    const node = input.nodes.find(candidate => candidate.id === approach.nodeId)!;
    expect(node.connections.some(connection => connection.level === 0 && connection.edgeIds.includes(edge.id))).toBe(true);
    expect([edge.from, edge.to]).toContain(approach.nodeId);
    expect(FootprintRegions.outside(approach.field, coordinateCover(road))).toEqual([]);
    const otherRoads = input.reservations.edges.filter(candidate => candidate.edgeId !== edge.id
      && input.edges.find(other => other.id === candidate.edgeId)!.level === 0).flatMap(candidate => candidate.roadway);
    expect(hasInteriorBeyondPrecision(FootprintRegions.inside(approach.field, otherRoads))).toBe(false);
    expect(hasInteriorBeyondPrecision(FootprintRegions.inside(approach.field, input.obstacles ?? []))).toBe(false);
    for (const side of ['left', 'right'] as const) {
      expect(FootprintRegions.outside(approach.landings[side], coordinateCover([...road, ...pedestrian]))).toEqual([]);
      expect(FootprintRegions.outside(approach.walkingLandings[side], coordinateCover(pedestrian))).toEqual([]);
      expect(FootprintRegions.outside(approach.walkingLandings[side], coordinateCover(reservation.sides[side].walking))).toEqual([]);
      expect(hasInteriorBeyondPrecision(FootprintRegions.inside(approach.landings[side], input.obstacles ?? []))).toBe(false);
    }
    for (const field of allFields) expect(FootprintRegions.inside(approach.field, [field])).toEqual([]);
    allFields.push(approach.field);
    const matches = segments.filter(item => item.nodeId === approach.nodeId && item.segment.edgeId === approach.edgeId);
    expect(matches).toHaveLength(1);
    expect(matches[0].segment.width).toBe(3);
    expect(matches[0].segment.markings).toHaveLength(3);
    for (const marking of matches[0].segment.markings) {
      expect(FootprintRegions.outside(marking, coordinateCover([approach.field]))).toEqual([]);
    }
  }
  const serialized: CrossingPlan = JSON.parse(JSON.stringify(plan));
  expect(() => CrossingPlanner.validate(input, serialized)).not.toThrow();
  expect(CrossingPlanner.plan(input)).toEqual(plan);
}

describe('CrossingPlanner public construction', () => {
  it('keeps a complete source field within both exact segment endpoints', () => {
    const input = fixture({ from: [0, 0], to: [3, 0] }, [{ id: 'road', from: 'from', to: 'to' }]);
    const edge = input.edges[0];
    const field = CrossingPlanner.construction(edge, { distance: 1.5 }).field;
    expect(edgeMaskView({ mask: field, encoding: 'authored-1mm' }))
      .toEqual([[0, -3.5], [3, -3.5], [3, 3.5], [0, 3.5]]);
    for (const distance of [1.5 - Number.EPSILON, 1.5 + Number.EPSILON]) {
      expect(() => CrossingPlanner.construction(edge, { distance }))
        .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    }
  });

  it('places complete fields beyond a sharp three-arm contact on long approaches', () => {
    const input = sharpJunction();
    input.edges.find(edge => edge.id === 'west-road')!.path.splice(1, 0, [-90, 0]);
    const before = JSON.stringify(input);
    const plan = CrossingPlanner.plan(input);
    expect(plan.junctions.flatMap(junction => junction.approaches).map(approach => approach.edgeId).sort())
      .toEqual(['branch-street', 'east-road', 'west-road']);
    const east = plan.junctions.flatMap(junction => junction.approaches).find(approach => approach.edgeId === 'east-road')!;
    expect(east.distance).toBeGreaterThan(15);
    verifyPlan(input, plan);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('publishes source-directed terminal cuts on rotated approaches', () => {
    const input = fixture({ center: [50, 50], west: [-50, 13], east: [150, 87], north: [13, 150] }, [
      { id: 'west', from: 'west', to: 'center', kind: 'road', width: 14 },
      { id: 'east', from: 'center', to: 'east', kind: 'road', width: 14 },
      { id: 'north', from: 'center', to: 'north' },
    ]);
    const plan = CrossingPlanner.plan(input);
    for (const approach of plan.junctions.flatMap(junction => junction.approaches)) {
      const edge = input.edges.find(candidate => candidate.id === approach.edgeId)!;
      const construction = CrossingPlanner.construction(edge, { distance: approach.distance });
      const view = (mask: typeof construction.field): Polygon => edgeMaskView({ mask, encoding: 'authored-1mm' });
      expect(view(construction.field)).toEqual(approach.field);
      for (const side of ['left', 'right'] as const) {
        expect(view(construction.landings[side])).toEqual(approach.landings[side]);
        expect(view(construction.walkingLandings[side])).toEqual(approach.walkingLandings[side]);
      }
      expect(() => CrossingPlanner.construction(edge, { distance: 0 }))
        .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
      const forward = [edge.path[1][0] - edge.path[0][0], edge.path[1][1] - edge.path[0][1]];
      for (const polygon of Object.values(approach.walkingLandings)) {
        expect(polygon).toHaveLength(4);
        expect((polygon[1][0] - polygon[0][0]) * forward[0]
          + (polygon[1][1] - polygon[0][1]) * forward[1]).toBeGreaterThan(0);
      }
    }
    verifyPlan(input, plan);
  });

  it('joins neighboring three-arm domains when their short internal edge cannot hold both fields', () => {
    const input = fixture({ a: [0, 0], b: [8, 0], west: [-100, 0], north: [0, 100],
      east: [110, 0], south: [8, -100] }, [
      { id: 'internal', from: 'a', to: 'b' }, { id: 'west', from: 'west', to: 'a' },
      { id: 'north', from: 'a', to: 'north' }, { id: 'east', from: 'b', to: 'east' },
      { id: 'south', from: 'south', to: 'b' },
    ]);
    const plan = CrossingPlanner.plan(input);
    expect(plan.junctions).toHaveLength(1);
    expect(plan.junctions[0].nodeIds).toEqual(['a', 'b']);
    expect(plan.junctions[0].internalEdgeIds).toEqual(['internal']);
    expect(plan.junctions[0].approaches.map(approach => approach.edgeId).sort()).toEqual(['east', 'north', 'south', 'west']);
    verifyPlan(input, plan);
  });

  it('retains an aligned street and pedestrian-alley contact without marking the alley', () => {
    const input = fixture({ center: [0, 0], east: [100, 0], west: [-100, 0] }, [
      { id: 'street', from: 'center', to: 'east' }, { id: 'alley', from: 'west', to: 'center', kind: 'alley' },
    ]);
    const plan = CrossingPlanner.plan(input);
    expect(plan.junctions.flatMap(junction => junction.approaches).map(approach => approach.edgeId)).toEqual(['street']);
    expect(plan.junctions[0].nodeIds).toEqual(['center']);
    verifyPlan(input, plan);
  });

  it('crosses an unmarked roadway margin and reaches full pedestrian terminal strips', () => {
    const input = fixture({ center: [0, 0], east: [100, 0], west: [-100, 0] }, [
      { id: 'street', from: 'center', to: 'east' }, { id: 'alley', from: 'west', to: 'center', kind: 'alley' },
    ]);
    const physicalRoad: Polygon = [[0, -4], [100, -4], [100, 4], [0, 4]];
    input.ground = [
      { surface: 'roadway', polygon: physicalRoad, bottom: -0.2, top: 0 },
      ...difference(input.ground.filter(owner => owner.surface === 'sidewalk').map(owner => owner.polygon), [physicalRoad])
        .map(polygon => ({ surface: 'sidewalk' as const, polygon, bottom: 0, top: 0.15 })),
    ];
    const plan = CrossingPlanner.plan(input);
    const approach = plan.junctions[0].approaches[0];
    expect(hasInteriorBeyondPrecision(FootprintRegions.inside(approach.landings.left, [physicalRoad]))).toBe(true);
    expect(plan.junctions[0].internalEdgeIds).toEqual([]);
    verifyPlan(input, plan);
  });

  it('fits the source carriageway even when final asphalt extends beyond its boundary', () => {
    const input = fixture({ center: [0, 0], east: [100, 0], west: [-100, 0] }, [
      { id: 'street', from: 'center', to: 'east' }, { id: 'alley', from: 'west', to: 'center', kind: 'alley' },
    ]);
    input.reservations.edges.find(edge => edge.edgeId === 'street')!.roadway = [
      [[0, -3.4989], [100, -3.5], [100, 3.5], [0, 3.5]],
    ];
    const plan = CrossingPlanner.plan(input);
    expect(plan.junctions[0].approaches[0].distance).toBeGreaterThan(5);
    verifyPlan(input, plan);
  });

  it('rejects missing final walking land without consuming a long connection', () => {
    const input = fixture({ a: [0, 0], b: [100, 0], west: [-100, 0], east: [200, 0] }, [
      { id: 'middle', from: 'a', to: 'b' }, { id: 'west', from: 'west', to: 'a' }, { id: 'east', from: 'b', to: 'east' },
    ]);
    input.ground = input.ground.filter(owner => owner.surface === 'roadway');
    expect(() => CrossingPlanner.plan(input)).toThrowError(expect.objectContaining({ code: 'E_UNSATISFIABLE' }));
  });

  it('keeps elevated projected arms outside the original grade-connected junction', () => {
    const positions: Record<string, Vec2> = { center: [0, 0], west: [-100, 0], east: [100, 0], north: [0, 100] };
    const specs: EdgeSpec[] = [{ id: 'west', from: 'west', to: 'center' },
      { id: 'east', from: 'center', to: 'east' }, { id: 'north', from: 'center', to: 'north' }];
    const gradeOnly = CrossingPlanner.plan(fixture(positions, specs));
    const input = fixture({ ...positions, deckNorth: [0, 120], deckSouth: [0, -120] }, [
      ...specs, { id: 'deck-north', from: 'center', to: 'deckNorth', kind: 'highway', width: 21, level: 8 },
      { id: 'deck-south', from: 'deckSouth', to: 'center', kind: 'highway', width: 21, level: 8 },
    ]);
    const plan = CrossingPlanner.plan(input);
    expect(input.nodes.find(node => node.id === 'center')!.connections).toHaveLength(2);
    expect(plan).toEqual(gradeOnly);
    verifyPlan(input, plan);
  });

  it('keeps a grade highway clear even though it has no pedestrian marking demand', () => {
    const input = fixture({ center: [0, 0], west: [-100, 0], east: [100, 0], highway: [100, 18] }, [
      { id: 'west', from: 'west', to: 'center' }, { id: 'east', from: 'center', to: 'east' },
      { id: 'highway', from: 'center', to: 'highway', kind: 'highway', width: 7 },
    ]);
    const plan = CrossingPlanner.plan(input);
    expect(plan.junctions.flatMap(junction => junction.approaches).map(approach => approach.edgeId))
      .not.toContain('highway');
    verifyPlan(input, plan);
  });

  it('requires exact mixed-profile traffic and excludes only its flat grade spans', () => {
    const input = fixture({ center: [0, 0], west: [-100, 0], east: [100, 0], highway: [100, 18] }, [
      { id: 'west', from: 'west', to: 'center' }, { id: 'east', from: 'center', to: 'east' },
      { id: 'highway', from: 'center', to: 'highway', kind: 'highway', width: 7 },
    ]);
    const highway = input.edges.find(edge => edge.id === 'highway')!;
    const length = highway.elevationProfile.at(-1)!.distance;
    highway.level = 8;
    highway.elevationProfile = [{ distance: 0, level: 0 }, { distance: 40, level: 0 }, { distance: length, level: 8 }];
    expect(() => CrossingPlanner.plan(input)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    const datum = GradeDatum.roadwayPlan({ boundary: [[-120, -120], [120, -120], [120, 120], [-120, 120]],
      edges: input.edges.slice(), roadwayTop: 0 });
    const byEdge = new Map<string, Polygon[]>();
    for (const owner of datum.roadway) {
      const edgeId = datum.spans.find(span => span.id === owner.spanId)!.edgeId;
      byEdge.set(edgeId, [...byEdge.get(edgeId) ?? [], ...owner.polygons]);
    }
    input.gradeRoadway = [...byEdge].map(([edgeId, polygons]) => ({ edgeId, polygons }));
    const road = union([...byEdge.values()].flat());
    const pedestrian = difference(input.reservations.edges.flatMap(edge =>
      [...edge.sides.left.sidewalk, ...edge.sides.right.sidewalk]), road);
    input.ground = [
      ...road.map(polygon => ({ surface: 'roadway' as const, polygon, bottom: -0.2, top: 0 })),
      ...pedestrian.map(polygon => ({ surface: 'sidewalk' as const, polygon, bottom: 0, top: 0.15 })),
    ];
    const plan = CrossingPlanner.plan(input);
    const east = plan.junctions.flatMap(junction => junction.approaches).find(approach => approach.edgeId === 'east')!;
    expect(east.distance).toBeGreaterThan(30);
    expect(east.distance).toBeLessThan(50);
    for (const approach of plan.junctions.flatMap(junction => junction.approaches)) {
      for (const polygon of [approach.field, approach.landings.left, approach.landings.right]) {
        expect(hasInteriorBeyondPrecision(FootprintRegions.inside(polygon, byEdge.get('highway')!))).toBe(false);
      }
    }
    expect(() => CrossingPlanner.validate(input, JSON.parse(JSON.stringify(plan)))).not.toThrow();
    expect(() => CrossingPlanner.plan({ ...input,
      gradeRoadway: input.gradeRoadway!.filter(source => source.edgeId !== highway.id),
    })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  });

  it('rejects a persisted field moved away from its source approach', () => {
    const input = sharpJunction();
    const plan = CrossingPlanner.plan(input);
    plan.junctions[0].approaches[0].field = plan.junctions[0].approaches[0].field.map(([x, z]) => [x + 1000, z + 1000]);
    expect(() => CrossingPlanner.validate(input, JSON.parse(JSON.stringify(plan))))
      .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });

  it('rejects an omitted required approach even when its matching marking record is also removed', () => {
    const input = sharpJunction();
    const plan = CrossingPlanner.plan(input);
    const removed = plan.junctions[0].approaches.pop()!;
    for (const crossing of plan.crossings) if (crossing.nodeId === removed.nodeId) {
      crossing.segments = crossing.segments.filter(segment => segment.edgeId !== removed.edgeId);
    }
    expect(() => CrossingPlanner.validate(input, JSON.parse(JSON.stringify(plan))))
      .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });

  it('rejects duplicated persisted approach ownership', () => {
    const input = sharpJunction();
    const plan = CrossingPlanner.plan(input);
    plan.junctions[0].approaches.push(structuredClone(plan.junctions[0].approaches[0]));
    expect(() => CrossingPlanner.validate(input, JSON.parse(JSON.stringify(plan))))
      .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });

  it('rejects saved crossings whose final ground owners are missing', () => {
    const input = sharpJunction();
    const plan = CrossingPlanner.plan(input);
    expect(() => CrossingPlanner.validate({ ...input, ground: [] }, JSON.parse(JSON.stringify(plan))))
      .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });

  it('keeps physical field obstacles independent of foreign-traffic exclusion', () => {
    const input = sharpJunction();
    const saved = CrossingPlanner.plan(input);
    const obstacle = structuredClone(saved.junctions[0].approaches[0].field);
    input.obstacles = [obstacle];
    expect(() => CrossingPlanner.validate(input, JSON.parse(JSON.stringify(saved))))
      .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    const plan = CrossingPlanner.plan(input);
    expect(plan).not.toEqual(saved);
    for (const junction of plan.junctions) for (const approach of junction.approaches) {
      expect(hasInteriorBeyondPrecision(FootprintRegions.inside(approach.field, [obstacle]))).toBe(false);
    }
    expect(() => CrossingPlanner.validate(input, JSON.parse(JSON.stringify(plan)))).not.toThrow();
  });
});
