/** Contract checks for 3D street continuity and level-separated junctions. */
import type { CityBlueprint, ElevationPoint, StreetEdge } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { length as pathLength } from '../geom/polyline';

const EPS = 1e-7;

export function checkStreetElevations(bp: CityBlueprint): void {
  const edgeById = new Map(bp.streets.edges.map((edge) => [edge.id, edge]));
  for (const edge of bp.streets.edges) checkProfile(edge);
  for (const node of bp.streets.nodes) {
    const published = node.connections.flatMap((connection) => connection.edgeIds);
    if (published.length !== node.edgeIds.length || new Set(published).size !== published.length
      || published.some((edgeId) => !node.edgeIds.includes(edgeId))) {
      throw invariantFailure(`street node ${node.id} has incomplete or duplicate connection groups`);
    }
    const levels = new Set<number>();
    for (const connection of node.connections) {
      if (!Number.isFinite(connection.level) || levels.has(connection.level) || connection.edgeIds.length === 0) {
        throw invariantFailure(`street node ${node.id} has an invalid connection level`);
      }
      levels.add(connection.level);
      for (const edgeId of connection.edgeIds) {
        const edge = edgeById.get(edgeId);
        if (!edge) throw invariantFailure(`street node ${node.id} connection references missing edge ${edgeId}`);
        const actual = endpointLevel(edge, node.id);
        if (Math.abs(actual - connection.level) > EPS) {
          throw invariantFailure(`street node ${node.id} joins ${edgeId} at the wrong level`, {
            published: connection.level,
            actual,
          });
        }
      }
    }
  }
}

function checkProfile(edge: StreetEdge): void {
  const profile = edge.elevationProfile;
  const total = pathLength(edge.path);
  if (profile.length < 2 || Math.abs(profile[0].distance) > EPS
    || Math.abs(profile[profile.length - 1].distance - total) > EPS) {
    throw invariantFailure(`street edge ${edge.id} elevation profile does not span its path`);
  }
  for (let i = 0; i < profile.length; i++) {
    const point = profile[i];
    if (!Number.isFinite(point.distance) || !Number.isFinite(point.level)
      || point.level < -EPS || point.level > edge.level + EPS) {
      throw invariantFailure(`street edge ${edge.id} has an invalid elevation point`);
    }
    if (i > 0 && point.distance <= profile[i - 1].distance) {
      throw invariantFailure(`street edge ${edge.id} elevation distances are not increasing`);
    }
    if (edge.class !== 'highway' && Math.abs(point.level - edge.level) > EPS) {
      throw invariantFailure(`street edge ${edge.id} changes level without a highway ramp`);
    }
  }
}

function endpointLevel(edge: StreetEdge, nodeId: string): number {
  const profile: ElevationPoint[] = edge.elevationProfile;
  if (edge.from === nodeId) return profile[0].level;
  if (edge.to === nodeId) return profile[profile.length - 1].level;
  throw invariantFailure(`street edge ${edge.id} does not end at node ${nodeId}`);
}
