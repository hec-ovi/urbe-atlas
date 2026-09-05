import { expect, it } from 'vitest';
import type { GroundSurface, StreetEdge, StreetNode, Vec2 } from '../../../schema/blueprint';
import { difference, union } from '../../geom/clip';
import { StreetCorridors } from '../construction/StreetCorridors';
import { CrossingPlanner } from './CrossingPlanner';
import type { CrossingInput } from './schema';

function adjacentContacts(): CrossingInput {
  const positions: Record<string, Vec2> = {
    a: [0, 0], b: [12, 0], west: [-100, 0], north: [0, 100], east: [112, 0], south: [12, -100],
  };
  const edges: StreetEdge[] = [
    ['internal', 'a', 'b'], ['west', 'west', 'a'], ['north', 'a', 'north'],
    ['east', 'b', 'east'], ['south', 'south', 'b'],
  ].map(([id, from, to]) => {
    const path = [positions[from], positions[to]];
    const length = Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]);
    const bands = { curb: 0.15, border: 0.35, furnishing: 1, walking: 2, frontage: 0.5 };
    return { id, from, to, path, class: 'street', width: 7,
      sidewalk: { left: 4, right: 4 }, districtIds: [], level: 0,
      elevationProfile: [{ distance: 0, level: 0 }, { distance: length, level: 0 }],
      crossSection: { runId: id, profileId: 'local',
        lanes: [{ direction: 'backward', width: 3.5, offset: 1.75 },
          { direction: 'forward', width: 3.5, offset: -1.75 }],
        shoulders: { left: 0, right: 0 }, sidewalks: {
          left: { profileId: 'walking', bands }, right: { profileId: 'walking', bands: { ...bands } },
        } },
    };
  });
  const nodes: StreetNode[] = Object.entries(positions).map(([id, position]) => {
    const edgeIds = edges.filter(edge => edge.from === id || edge.to === id).map(edge => edge.id);
    return { id, position, edgeIds, connections: [{ level: 0, edgeIds }] };
  });
  const reservations = StreetCorridors.reservations(edges);
  const road = union(reservations.edges.flatMap(edge => edge.roadway));
  const pedestrian = difference(reservations.edges.flatMap(edge =>
    [...edge.sides.left.sidewalk, ...edge.sides.right.sidewalk]), road);
  const ground: GroundSurface[] = [
    ...road.map(polygon => ({ surface: 'roadway' as const, polygon, bottom: -0.2, top: 0 })),
    ...pedestrian.map(polygon => ({ surface: 'sidewalk' as const, polygon, bottom: 0, top: 0.15 })),
  ];
  return { nodes, edges, reservations, ground };
}

it('rejects a fitted marking whose source edge is internal to the persisted contact domain', () => {
  const input = adjacentContacts();
  const plan = CrossingPlanner.plan(input);
  const junction = plan.junctions.find(candidate => candidate.internalEdgeIds.includes('internal'))!;
  expect(junction.internalEdgeIds).toEqual(['internal']);

  const frontier = structuredClone(input);
  const endpoint = frontier.nodes.find(node => node.id === 'b')!;
  endpoint.connections = endpoint.edgeIds.map(edgeId => ({ level: 0, edgeIds: [edgeId] }));
  const sourcePlan = CrossingPlanner.plan(frontier);
  const approach = sourcePlan.junctions.flatMap(candidate => candidate.approaches)
    .find(candidate => candidate.edgeId === 'internal')!;
  const marking = sourcePlan.crossings.flatMap(crossing => crossing.segments)
    .find(segment => segment.edgeId === 'internal')!;
  expect(approach).toBeDefined();
  expect(marking).toBeDefined();
  junction.approaches.push(approach);
  plan.crossings.find(crossing => crossing.nodeId === approach.nodeId && crossing.junctionId === junction.id)!
    .segments.push(marking);

  expect(() => CrossingPlanner.validate(input, JSON.parse(JSON.stringify(plan))))
    .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
});
