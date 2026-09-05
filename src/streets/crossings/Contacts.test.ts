import { expect, it } from 'vitest';
import type { Crossing, GroundSurface, StreetClass, StreetEdge, StreetNode, Vec2 } from '../../../schema/blueprint';
import { difference, union } from '../../geom/clip';
import { resolveStreetDesign } from '../construction/Design';
import { StreetCorridors } from '../construction/StreetCorridors';
import { StreetSections } from '../construction/StreetSections';
import { CrossingPlanner } from './CrossingPlanner';
import type { CrossingInput, CrossingSourceInput, SourceContactDomain } from './schema';

function source(
  positions: Record<string, Vec2>, specs: [string, string, string, StreetClass?][], modern = false,
): CrossingSourceInput {
  const edges: StreetEdge[] = specs.map(([id, from, to, kind = 'street']) => {
    const path = [positions[from], positions[to]];
    const length = Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]);
    return { id, from, to, path, class: kind, width: kind === 'alley' ? 0 : kind === 'road' ? 14 : 7,
      sidewalk: { left: kind === 'highway' ? 0 : 4, right: kind === 'highway' ? 0 : 4 },
      districtIds: [], level: 0, elevationProfile: [{ distance: 0, level: 0 }, { distance: length, level: 0 }] };
  });
  const nodes: StreetNode[] = Object.entries(positions).map(([id, position]) => {
    const edgeIds = edges.filter(edge => edge.from === id || edge.to === id).map(edge => edge.id);
    return { id, position, edgeIds, connections: [{ level: 0, edgeIds }] };
  });
  const design = resolveStreetDesign();
  if (modern) design.sidewalkProfiles = [{ id: 'four-metre', curb: 0.2, border: 0,
    furnishing: 1, walking: 2, frontage: 1,
    edge: { curbRise: 0.2, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' } } } }];
  const sections = StreetSections.plan(edges, nodes, design, () => 'residential');
  const graded = sections.edges.map(edge => ({ ...edge,
    elevationProfile: edges.find(source => source.id === edge.id)!.elevationProfile.map(knot => ({ ...knot })),
  }));
  return { nodes, edges: graded, reservations: StreetCorridors.reservations(graded) };
}

function withGround(input: CrossingSourceInput): CrossingInput {
  const roadway = union(input.reservations.edges.flatMap(edge => edge.roadway));
  const sidewalk = difference(input.reservations.edges.flatMap(edge =>
    [...edge.sides.left.sidewalk, ...edge.sides.right.sidewalk]), roadway);
  const ground: GroundSurface[] = [
    ...roadway.map(polygon => ({ surface: 'roadway' as const, polygon, bottom: -0.2, top: 0 })),
    ...sidewalk.map(polygon => ({ surface: 'sidewalk' as const, polygon, bottom: 0, top: 0.15 })),
  ];
  return { ...input, ground };
}

const junctions = (domains: SourceContactDomain[]): SourceContactDomain[] =>
  domains.filter(domain => domain.groups.some(group => group.junction));

function tee(modern = false): CrossingSourceInput {
  return source({ middle: [0, 0], west: [-100, 0], east: [100, 0], north: [0, 100] },
    [['west', 'west', 'middle', 'road'], ['east', 'middle', 'east', 'road'], ['north', 'middle', 'north']], modern);
}

it('publishes original topological membership before modern ground exists', () => {
  const input = tee(true), before = JSON.stringify(input);
  const contacts = CrossingPlanner.contacts(input);
  expect(junctions(contacts.domains)).toEqual([{
    id: 'middle:connection:0',
    groups: [{ id: 'middle:connection:0', nodeId: 'middle',
      pedestrianEdgeIds: ['east', 'north', 'west'], trafficEdgeIds: ['east', 'north', 'west'], junction: true }],
    internalEdgeIds: [],
    arms: [
      { groupId: 'middle:connection:0', nodeId: 'middle', edgeId: 'east', end: 'from', crossing: true },
      { groupId: 'middle:connection:0', nodeId: 'middle', edgeId: 'north', end: 'from', crossing: true },
      { groupId: 'middle:connection:0', nodeId: 'middle', edgeId: 'west', end: 'to', crossing: true },
    ],
  }]);
  expect(contacts.domains).toHaveLength(4);
  expect(contacts.domains.filter(domain => !domain.groups.some(group => group.junction))
    .every(domain => domain.arms.every(arm => !arm.crossing))).toBe(true);
  const permuted = structuredClone(input);
  permuted.nodes = [...permuted.nodes].reverse(); permuted.edges = [...permuted.edges].reverse();
  permuted.reservations.edges.reverse();
  expect(CrossingPlanner.contacts(permuted)).toEqual(contacts);
  expect(JSON.stringify(input)).toBe(before);
  contacts.domains[0].groups[0].pedestrianEdgeIds.length = 0;
  expect(CrossingPlanner.contacts(input)).toEqual(CrossingPlanner.contacts(permuted));
});

it('uses the same extended source domain for final approaches and saved validation', () => {
  const input = withGround(source({ middle: [0, 0], continuation: [2, 0], west: [-100, 0],
    east: [102, 0], north: [0, 100] }, [
    ['west', 'west', 'middle', 'road'], ['stub', 'middle', 'continuation', 'road'],
    ['east', 'continuation', 'east', 'road'], ['north', 'middle', 'north'],
  ]));
  const contact = junctions(CrossingPlanner.contacts(input).domains)[0];
  expect(contact.groups.map(group => group.id)).toEqual(['continuation:connection:0', 'middle:connection:0']);
  expect(contact.groups.map(group => group.junction)).toEqual([false, true]);
  expect(contact.internalEdgeIds).toEqual(['stub']);
  const plan = CrossingPlanner.plan(input);
  expect(plan.junctions).toHaveLength(1);
  const junction = plan.junctions[0];
  expect(junction.groupIds).toEqual(contact.groups.map(group => group.id));
  expect(junction.internalEdgeIds).toEqual(contact.internalEdgeIds);
  expect(junction.approaches.map(({ groupId, nodeId, edgeId }) => ({ groupId, nodeId, edgeId })))
    .toEqual(contact.arms.filter(arm => arm.crossing).map(({ groupId, nodeId, edgeId }) => ({ groupId, nodeId, edgeId })));
  const compatible: Crossing[] = plan.crossings;
  expect(() => CrossingPlanner.validate(input, { ...plan, crossings: compatible })).not.toThrow();
  const changed = structuredClone(plan);
  changed.junctions[0].groupIds.pop();
  expect(() => CrossingPlanner.validate(input, changed)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
});

it('retains unmarked arms and separate grade connections at the same source node', () => {
  const input = source({ middle: [0, 0], east: [100, 0], west: [-100, 0], north: [0, 100],
    south: [0, -100], diagonal: [-100, -100], deck: [100, 100] }, [
    ['street', 'middle', 'east'], ['alley', 'west', 'middle', 'alley'],
    ['highway', 'middle', 'north', 'highway'], ['other', 'middle', 'south', 'alley'],
    ['other-alley', 'diagonal', 'middle', 'alley'], ['deck', 'middle', 'deck', 'highway'],
  ]);
  const deck = input.edges.find(edge => edge.id === 'deck')!;
  deck.level = 8; deck.elevationProfile.forEach(knot => { knot.level = 8; });
  input.nodes.find(node => node.id === 'middle')!.connections = [
    { level: 0, edgeIds: ['street', 'alley', 'highway'] },
    { level: 0, edgeIds: ['other', 'other-alley'] }, { level: 8, edgeIds: ['deck'] },
  ];
  input.nodes.find(node => node.id === 'deck')!.connections[0].level = 8;
  const domains = junctions(CrossingPlanner.contacts(input).domains);
  expect(domains.map(domain => domain.id)).toEqual(['middle:connection:0', 'middle:connection:1']);
  expect(domains[0].groups[0]).toEqual({ id: 'middle:connection:0', nodeId: 'middle',
    pedestrianEdgeIds: ['alley', 'street'], trafficEdgeIds: ['highway', 'street'], junction: true });
  expect(domains[0].arms.map(arm => [arm.edgeId, arm.end, arm.crossing]))
    .toEqual([['alley', 'to', false], ['highway', 'from', false], ['street', 'from', true]]);
  expect(domains[1].arms.map(arm => arm.edgeId)).toEqual(['other', 'other-alley']);
  expect(domains[1].arms.every(arm => !arm.crossing)).toBe(true);
});

it('keeps source contacts independent of missing final land and physical obstacles', () => {
  const input = tee(), expected = CrossingPlanner.contacts(input);
  const unavailable: CrossingInput = { ...input, ground: [],
    obstacles: [[[-200, -200], [200, -200], [200, 200], [-200, 200]]] };
  expect(CrossingPlanner.contacts(unavailable)).toEqual(expected);
  expect(() => CrossingPlanner.plan(unavailable)).toThrowError(expect.objectContaining({ code: 'E_UNSATISFIABLE' }));
  expect(CrossingPlanner.contacts(input)).toEqual(expected);
});

it('requires complete grade-traffic inputs for mixed source profiles', () => {
  const input = tee();
  const edge = input.edges.find(edge => edge.id === 'north')!;
  edge.class = 'highway'; edge.sidewalk = { left: 0, right: 0 }; delete edge.crossSection;
  edge.level = 8;
  edge.elevationProfile = [{ distance: 0, level: 0 }, { distance: 40, level: 0 }, { distance: 100, level: 8 }];
  input.nodes.find(node => node.id === 'north')!.connections[0].level = 8;
  expect(() => CrossingPlanner.contacts(input)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  input.gradeRoadway = input.reservations.edges.map(source => ({ edgeId: source.edgeId,
    polygons: source.edgeId === 'north' ? [] : source.roadway }));
  expect(junctions(CrossingPlanner.contacts(input).domains)[0].groups[0].trafficEdgeIds).toEqual(['east', 'north', 'west']);
  input.gradeRoadway = input.gradeRoadway.filter(source => source.edgeId !== 'north');
  expect(() => CrossingPlanner.contacts(input)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
});
