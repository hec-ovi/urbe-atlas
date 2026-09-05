import type { StreetEdge } from '../../../../schema/blueprint';
import { length as pathLength } from '../../../geom/polyline';
import { designHighwayEnvelopes } from './Envelopes';
import { levelAt } from './Profiles';
import { runEdges } from './RunEdges';

/** Assigns routing heights from the same early envelope used for construction. */
export function applyHighwayElevationProfiles(edges: StreetEdge[]): void {
  for (const edge of edges) {
    edge.elevationProfile = [
      { distance: 0, level: edge.level },
      { distance: pathLength(edge.path), level: edge.level },
    ];
  }
  const byId = new Map(edges.map((edge) => [edge.id, edge]));
  for (const envelope of designHighwayEnvelopes(edges)) {
    for (const part of runEdges(envelope, byId)) {
      const distances = [part.start, part.end];
      for (const point of envelope.elevationProfile) {
        if (point.distance > part.start + 1e-9 && point.distance < part.end - 1e-9) {
          distances.push(point.distance);
        }
      }
      part.edge.elevationProfile = distances
        .map((distance) => ({
          distance: part.forward ? distance - part.start : part.end - distance,
          level: levelAt(envelope.elevationProfile, distance),
        }))
        .sort((a, b) => a.distance - b.distance);
    }
  }
}
