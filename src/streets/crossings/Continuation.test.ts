import { describe, expect, it } from 'vitest';
import type { GroundSurface, Polygon, StreetEdge, StreetNode, Vec2 } from '../../../schema/blueprint';
import { coordinateCover, difference, union } from '../../geom/clip';
import { StreetCorridors } from '../construction/StreetCorridors';
import { CrossingPlanner } from './CrossingPlanner';
import { FootprintRegions } from './intervals/FootprintRegions';
import type { CrossingInput, CrossingPlan } from './schema';

function edge(id: string, from: string, to: string, path: Vec2[], runId = 'through'): StreetEdge {
  const length = path.slice(1).reduce((sum, point, index) =>
    sum + Math.hypot(point[0] - path[index][0], point[1] - path[index][1]), 0);
  const bands = { curb: 0.15, border: 0.35, furnishing: 1, walking: 2, frontage: 0.5 };
  return { id, from, to, path, class: 'street', width: 7, sidewalk: { left: 4, right: 4 },
    districtIds: [], level: 0, elevationProfile: [{ distance: 0, level: 0 }, { distance: length, level: 0 }],
    crossSection: { runId, profileId: 'local', shoulders: { left: 0, right: 0 },
      lanes: [{ direction: 'backward', width: 3.5, offset: 1.75 }, { direction: 'forward', width: 3.5, offset: -1.75 }],
      sidewalks: { left: { profileId: 'sidewalk', bands }, right: { profileId: 'sidewalk', bands: { ...bands } } } } };
}

function fixture(edges: StreetEdge[]): CrossingInput {
  const positions = new Map<string, Vec2>();
  for (const edge of edges) { positions.set(edge.from, edge.path[0]); positions.set(edge.to, edge.path.at(-1)!); }
  const nodes: StreetNode[] = [...positions].map(([id, position]) => {
    const edgeIds = edges.filter(edge => edge.from === id || edge.to === id).map(edge => edge.id);
    return { id, position, edgeIds, connections: [{ level: 0, edgeIds }] };
  });
  const reservations = StreetCorridors.reservations(edges);
  const road = union(reservations.edges.flatMap(edge => edge.roadway));
  const sidewalk = difference(reservations.edges.flatMap(edge => [...edge.sides.left.sidewalk, ...edge.sides.right.sidewalk]), road);
  const ground: GroundSurface[] = [...road.map(polygon => ({ surface: 'roadway' as const, polygon, bottom: -0.2, top: 0 })),
    ...sidewalk.map(polygon => ({ surface: 'sidewalk' as const, polygon, bottom: 0, top: 0.15 }))];
  return { nodes, edges, reservations, ground };
}

function verifyApproaches(input: CrossingInput, expectedEdges: string[], nodeByEdge: Record<string, string> = {}): CrossingPlan {
  const plan = CrossingPlanner.plan(input);
  const approaches = plan.junctions.flatMap(junction => junction.approaches);
  expect(approaches.map(approach => approach.edgeId).sort()).toEqual(expectedEdges);
  const road = input.ground.filter(owner => owner.surface === 'roadway').map(owner => owner.polygon);
  const sidewalk = input.ground.filter(owner => owner.surface === 'sidewalk').map(owner => owner.polygon);
  for (const approach of approaches) {
    expect(approach.nodeId).toBe(nodeByEdge[approach.edgeId] ?? 'middle');
    expect(FootprintRegions.outside(approach.field, coordinateCover(road))).toEqual([]);
    for (const side of ['left', 'right'] as const) {
      expect(FootprintRegions.outside(approach.walkingLandings[side], coordinateCover(sidewalk))).toEqual([]);
    }
  }
  expect(() => CrossingPlanner.validate(input, JSON.parse(JSON.stringify(plan)))).not.toThrow();
  expect(CrossingPlanner.plan(input)).toEqual(plan);
  return plan;
}

describe('CrossingPlanner continuation demand', () => {
  it.each([
    { name: 'straight', end: [200, 0] as Vec2 },
    { name: 'bent', end: [180, 60] as Vec2 },
  ])('preserves crossing demand when a $name through-run is split into graph edges', ({ end }) => {
    const path: Vec2[] = [[0, 0], [100, 0], end];
    const whole = fixture([edge('whole', 'start', 'end', path)]);
    const split = fixture([edge('west', 'start', 'middle', path.slice(0, 2)), edge('east', 'middle', 'end', path.slice(1))]);
    const before = JSON.stringify(split);
    const contacts = CrossingPlanner.contacts(split);
    expect(contacts.domains).toHaveLength(3);
    expect(contacts.domains.every(domain => domain.groups.every(group => !group.junction)
      && domain.arms.every(arm => !arm.crossing))).toBe(true);
    const expected = CrossingPlanner.plan(whole);
    expect(expected).toEqual({ crossings: [], junctions: [] });
    expect(CrossingPlanner.plan(split)).toEqual(expected);
    expect(() => CrossingPlanner.validate(split, expected)).not.toThrow();
    expect(JSON.stringify(split)).toBe(before);
    if (end[1] === 0) {
      const walkingStrip: Polygon = [[30, 5.5], [170, 5.5], [170, 6.5], [30, 6.5]];
      const sidewalk = split.ground.filter(owner => owner.surface === 'sidewalk').map(owner => owner.polygon);
      expect(FootprintRegions.outside(walkingStrip, coordinateCover(sidewalk))).toEqual([]);
    }
  });

  it('retains a three-arm contact containing a paired through-run', () => {
    const input = fixture([edge('west', 'start', 'middle', [[0, 0], [100, 0]]),
      edge('east', 'middle', 'end', [[100, 0], [200, 0]]),
      edge('north', 'middle', 'branch', [[100, 0], [100, 100]], 'branch')]);
    verifyApproaches(input, ['east', 'north', 'west']);
  });

  it('retains a three-arm grade contact when one arm carries no pedestrian approach', () => {
    const branch = edge('north', 'middle', 'branch', [[100, 0], [100, 100]], 'branch');
    branch.class = 'highway'; branch.sidewalk = { left: 0, right: 0 }; delete branch.crossSection;
    verifyApproaches(fixture([edge('west', 'start', 'middle', [[0, 0], [100, 0]]),
      edge('east', 'middle', 'end', [[100, 0], [200, 0]]), branch]), ['east', 'west']);
  });

  it('extends a real junction through a short continuation edge to its next source arm', () => {
    const west = edge('west', 'start', 'middle', [[0, 0], [100, 0]]);
    const north = edge('north', 'middle', 'branch', [[100, 0], [100, 100]], 'branch');
    const whole = fixture([west, edge('east', 'middle', 'end', [[100, 0], [202, 0]]), north]);
    const baseline = verifyApproaches(whole, ['east', 'north', 'west']);
    const split = fixture([west, edge('stub', 'middle', 'continuation', [[100, 0], [102, 0]]),
      edge('east', 'continuation', 'end', [[102, 0], [202, 0]]), north]);
    const before = JSON.stringify(split);
    const plan = verifyApproaches(split, ['east', 'north', 'west'], { east: 'continuation' });
    expect(plan.junctions).toHaveLength(1);
    expect(plan.junctions[0].nodeIds).toEqual(['continuation', 'middle']);
    expect(plan.junctions[0].groupIds).toEqual(['continuation:connection:0', 'middle:connection:0']);
    expect(plan.junctions[0].internalEdgeIds).toEqual(['stub']);
    expect(plan.crossings.flatMap(crossing => crossing.segments.map(segment => segment.edgeId)).sort())
      .toEqual(baseline.crossings.flatMap(crossing => crossing.segments.map(segment => segment.edgeId)).sort());
    expect(JSON.stringify(split)).toBe(before);
  });

  it.each(['different', 'missing'])('retains demand when the two run identities are %s', mode => {
    const west = edge('west', 'start', 'middle', [[0, 0], [100, 0]]);
    const east = edge('east', 'middle', 'end', [[100, 0], [200, 0]], 'other');
    if (mode === 'missing') { delete west.crossSection; delete east.crossSection; }
    verifyApproaches(fixture([west, east]), ['east', 'west']);
  });
});
