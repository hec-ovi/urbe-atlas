import { describe, expect, it } from 'vitest';
import type { GroundSurface, Polygon, StreetClass, StreetEdge, StreetNode, Vec2 } from '../../../schema/blueprint';
import { coordinateCover, difference, hasInteriorBeyondPrecision, union } from '../../geom/clip';
import { edgeMaskView } from '../../geom/partition/EdgeMasks';
import { StreetCorridors } from '../construction/StreetCorridors';
import { GradeDatum } from '../construction/datum';
import { CrossingPlanner } from './CrossingPlanner';
import { FootprintRegions } from './intervals/FootprintRegions';
import type { CrossingInput, CrossingPlan, JunctionApproach } from './schema';

interface EdgeSpec {
  id: string;
  from: string;
  to: string;
  kind?: StreetClass;
  width?: number;
  level?: number;
  runId?: string;
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
        runId: spec.runId ?? `run-${spec.id}`, profileId: `road-${width}`,
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

/** Two three-arm contacts sharing one short internal edge. */
function adjacentContacts(): CrossingInput {
  return fixture({ a: [0, 0], b: [12, 0], west: [-100, 0], north: [0, 100], east: [112, 0], south: [12, -100] }, [
    { id: 'internal', from: 'a', to: 'b' }, { id: 'west', from: 'west', to: 'a' },
    { id: 'north', from: 'a', to: 'north' }, { id: 'east', from: 'b', to: 'east' },
    { id: 'south', from: 'south', to: 'b' },
  ]);
}

/** Every published approach owns its complete field, connectors and terminal strips. */
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
  it('publishes exact construction masks, stations and terminal cuts for every placed approach', () => {
    const straight = fixture({ from: [0, 0], to: [3, 0] }, [{ id: 'road', from: 'from', to: 'to' }]);
    const source = straight.edges[0];
    expect(edgeMaskView({ mask: CrossingPlanner.construction(source, { distance: 1.5 }).field, encoding: 'authored-1mm' }))
      .toEqual([[0, -3.5], [3, -3.5], [3, 3.5], [0, 3.5]]);
    for (const distance of [0, 1.5 - Number.EPSILON, 1.5 + Number.EPSILON]) {
      expect(() => CrossingPlanner.construction(source, { distance }))
        .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    }

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
      const span = [edge.path[1][0] - edge.path[0][0], edge.path[1][1] - edge.path[0][1]];
      const length = Math.hypot(span[0], span[1]);
      const station = (point: Vec2): number =>
        ((point[0] - edge.path[0][0]) * span[0] + (point[1] - edge.path[0][1]) * span[1]) / length;
      expect(approach.station[0]).toBeCloseTo(approach.distance - 1.5, 9);
      expect(approach.station[1]).toBeCloseTo(approach.distance + 1.5, 9);
      const facing = approach.station[approach.nodeId === edge.from ? 0 : 1];
      for (const corner of [approach.cut.left, approach.cut.right]) expect(station(corner)).toBeCloseTo(facing, 3);
      for (const polygon of Object.values(approach.walkingLandings)) {
        expect(polygon).toHaveLength(4);
        expect(station(polygon[1])).toBeGreaterThan(station(polygon[0]));
      }
    }
    verifyPlan(input, plan);
  });

  it('resolves source contact domains from the original topology alone', () => {
    const positions: Record<string, Vec2> = { center: [0, 0], west: [-180, 0], east: [180, 0], branch: [160, 60] };
    const specs: EdgeSpec[] = [{ id: 'west-road', from: 'west', to: 'center', kind: 'road', width: 14 },
      { id: 'east-road', from: 'center', to: 'east', kind: 'road', width: 14 },
      { id: 'branch-street', from: 'center', to: 'branch' }];
    const input = fixture(positions, specs);
    const before = JSON.stringify(input);
    const contacts = CrossingPlanner.contacts(input);
    expect(contacts.domains).toHaveLength(4);
    expect(contacts.domains.filter(domain => domain.groups.some(group => group.junction))).toEqual([{
      id: 'center:connection:0',
      groups: [{ id: 'center:connection:0', nodeId: 'center',
        pedestrianEdgeIds: ['branch-street', 'east-road', 'west-road'],
        trafficEdgeIds: ['branch-street', 'east-road', 'west-road'], junction: true }],
      internalEdgeIds: [],
      arms: [
        { groupId: 'center:connection:0', nodeId: 'center', edgeId: 'branch-street', end: 'from', crossing: true },
        { groupId: 'center:connection:0', nodeId: 'center', edgeId: 'east-road', end: 'from', crossing: true },
        { groupId: 'center:connection:0', nodeId: 'center', edgeId: 'west-road', end: 'to', crossing: true },
      ],
    }]);
    expect(contacts.domains.filter(domain => !domain.groups.some(group => group.junction))
      .every(domain => domain.arms.every(arm => !arm.crossing))).toBe(true);

    const permuted = structuredClone(input);
    permuted.nodes = [...permuted.nodes].reverse();
    permuted.edges = [...permuted.edges].reverse();
    permuted.reservations.edges.reverse();
    expect(CrossingPlanner.contacts(permuted)).toEqual(contacts);
    contacts.domains[0].groups[0].pedestrianEdgeIds.length = 0;
    expect(CrossingPlanner.contacts(input)).toEqual(CrossingPlanner.contacts(permuted));
    expect(JSON.stringify(input)).toBe(before);

    const elevated = fixture({ ...positions, deckNorth: [0, 120], deckSouth: [0, -120] }, [...specs,
      { id: 'deck-north', from: 'center', to: 'deckNorth', kind: 'highway', width: 21, level: 8 },
      { id: 'deck-south', from: 'deckSouth', to: 'center', kind: 'highway', width: 21, level: 8 }]);
    expect(elevated.nodes.find(node => node.id === 'center')!.connections).toHaveLength(2);
    const plan = CrossingPlanner.plan(input);
    expect(CrossingPlanner.plan(elevated)).toEqual(plan);
    verifyPlan(input, plan);

    const unavailable: CrossingInput = { ...input, ground: [],
      obstacles: [[[-200, -200], [200, -200], [200, 200], [-200, 200]]] };
    expect(CrossingPlanner.contacts(unavailable)).toEqual(CrossingPlanner.contacts(input));
    expect(() => CrossingPlanner.plan(unavailable)).toThrowError(expect.objectContaining({ code: 'E_UNSATISFIABLE' }));
  });

  it('marks only the arms whose original contact creates demand', () => {
    const through = (runId: string): CrossingInput =>
      fixture({ start: [0, 0], middle: [100, 0], end: [200, 0] }, [
        { id: 'west', from: 'start', to: 'middle', runId: 'through' },
        { id: 'east', from: 'middle', to: 'end', runId }]);
    const continuation = through('through');
    const contacts = CrossingPlanner.contacts(continuation);
    expect(contacts.domains).toHaveLength(3);
    expect(contacts.domains.every(domain => domain.groups.every(group => !group.junction)
      && domain.arms.every(arm => !arm.crossing))).toBe(true);
    expect(CrossingPlanner.plan(continuation)).toEqual({ crossings: [], junctions: [] });

    const separateRuns = through('other');
    const runsPlan = CrossingPlanner.plan(separateRuns);
    expect(runsPlan.junctions.flatMap(junction => junction.approaches).map(approach => approach.edgeId).sort())
      .toEqual(['east', 'west']);
    verifyPlan(separateRuns, runsPlan);

    const unmarked = fixture({ center: [0, 0], east: [100, 0], west: [-100, 0], north: [0, 100] }, [
      { id: 'street', from: 'center', to: 'east' }, { id: 'alley', from: 'west', to: 'center', kind: 'alley' },
      { id: 'highway', from: 'center', to: 'north', kind: 'highway', width: 7 }]);
    const unmarkedPlan = CrossingPlanner.plan(unmarked);
    expect(unmarkedPlan.junctions.flatMap(junction => junction.approaches).map(approach => approach.edgeId))
      .toEqual(['street']);
    expect(unmarkedPlan.junctions[0].nodeIds).toEqual(['center']);
    verifyPlan(unmarked, unmarkedPlan);
  });

  it('joins demanded domains through the short internal edge they share', () => {
    const input = adjacentContacts();
    const contact = CrossingPlanner.contacts(input).domains.find(domain => domain.groups.some(group => group.junction))!;
    expect(contact.groups.map(group => group.id)).toEqual(['a:connection:0', 'b:connection:0']);
    expect(contact.internalEdgeIds).toEqual(['internal']);
    const plan = CrossingPlanner.plan(input);
    expect(plan.junctions).toHaveLength(1);
    const junction = plan.junctions[0];
    expect(junction.nodeIds).toEqual(['a', 'b']);
    expect(junction.groupIds).toEqual(contact.groups.map(group => group.id));
    expect(junction.internalEdgeIds).toEqual(contact.internalEdgeIds);
    expect(junction.approaches.map(({ groupId, nodeId, edgeId }) => ({ groupId, nodeId, edgeId })))
      .toEqual(contact.arms.filter(arm => arm.crossing).map(({ groupId, nodeId, edgeId }) => ({ groupId, nodeId, edgeId })));
    expect(junction.approaches.map(approach => approach.edgeId)).toEqual(['east', 'north', 'south', 'west']);
    verifyPlan(input, plan);
  });

  it('rejects persisted plans whose references or geometry break construction ownership', () => {
    const input = adjacentContacts();
    const saved = CrossingPlanner.plan(input);
    const frontier = adjacentContacts();
    const endpoint = frontier.nodes.find(node => node.id === 'b')!;
    endpoint.connections = endpoint.edgeIds.map(edgeId => ({ level: 0, edgeIds: [edgeId] }));
    const frontierPlan = CrossingPlanner.plan(frontier);
    const internalApproach: JunctionApproach = frontierPlan.junctions.flatMap(junction => junction.approaches)
      .find(approach => approach.edgeId === 'internal')!;
    const internalMarking = frontierPlan.crossings.flatMap(crossing => crossing.segments)
      .find(segment => segment.edgeId === 'internal')!;

    const reject = (mutate: (plan: CrossingPlan) => CrossingInput | undefined): void => {
      const plan = structuredClone(saved);
      expect(() => CrossingPlanner.validate(mutate(plan) ?? input, JSON.parse(JSON.stringify(plan))))
        .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    };
    reject(plan => {
      const approach = plan.junctions[0].approaches[0];
      approach.field = approach.field.map(([x, z]) => [x + 1000, z + 1000]);
      return undefined;
    });
    reject(plan => {
      const removed = plan.junctions[0].approaches.pop()!;
      for (const crossing of plan.crossings) if (crossing.nodeId === removed.nodeId) {
        crossing.segments = crossing.segments.filter(segment => segment.edgeId !== removed.edgeId);
      }
      return undefined;
    });
    reject(plan => {
      plan.junctions[0].approaches.push(structuredClone(plan.junctions[0].approaches[0]));
      return undefined;
    });
    reject(plan => {
      plan.junctions[0].approaches.push(structuredClone(internalApproach));
      plan.crossings.find(crossing => crossing.nodeId === internalApproach.nodeId
        && crossing.junctionId === plan.junctions[0].id)!.segments.push(structuredClone(internalMarking));
      return undefined;
    });
    reject(() => ({ ...input, ground: [] }));
    reject(() => frontier);

    const blocked: CrossingInput = { ...input, obstacles: [structuredClone(saved.junctions[0].approaches[0].field)] };
    expect(() => CrossingPlanner.validate(blocked, JSON.parse(JSON.stringify(saved))))
      .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    const replanned = CrossingPlanner.plan(blocked);
    expect(replanned).not.toEqual(saved);
    verifyPlan(blocked, replanned);
  });

  it('requires complete grade traffic for a mixed-height source and excludes its flat spans', () => {
    const input = fixture({ center: [0, 0], west: [-100, 0], east: [100, 0], highway: [100, 18] }, [
      { id: 'west', from: 'west', to: 'center' }, { id: 'east', from: 'center', to: 'east' },
      { id: 'highway', from: 'center', to: 'highway', kind: 'highway', width: 7 },
    ]);
    const highway = input.edges.find(edge => edge.id === 'highway')!;
    const length = highway.elevationProfile.at(-1)!.distance;
    highway.level = 8;
    highway.elevationProfile = [{ distance: 0, level: 0 }, { distance: 40, level: 0 }, { distance: length, level: 8 }];
    for (const call of [() => CrossingPlanner.contacts(input), () => CrossingPlanner.plan(input)]) {
      expect(call).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    }

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

    const clipped = CrossingPlanner.contacts({ ...input,
      gradeRoadway: input.gradeRoadway.map(source => source.edgeId === highway.id ? { ...source, polygons: [] } : source) });
    expect(clipped.domains.find(domain => domain.id === 'center:connection:0')!.groups[0].trafficEdgeIds)
      .toEqual(['east', 'highway', 'west']);
    expect(() => CrossingPlanner.plan({ ...input,
      gradeRoadway: input.gradeRoadway!.filter(source => source.edgeId !== highway.id) }))
      .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  });
});
