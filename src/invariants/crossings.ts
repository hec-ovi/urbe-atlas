/** Contract checks for construction-ready pedestrian crossing geometry. */
import type { CityBlueprint } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { area, centroid, isSimpleRing } from '../geom/polygon';
import { add, dot, normalize, perp, scale, sub } from '../geom/vec';
import { CROSSING } from '../streets/Crossings';

/** Allows accumulated 1 mm fixed-point rounding across all four polygon corners. */
const POSITION_EPS = 0.005;

export function checkCrossings(bp: CityBlueprint): void {
  const nodes = new Map(bp.streets.nodes.map((node) => [node.id, node]));
  const edges = new Map(bp.streets.edges.map((edge) => [edge.id, edge]));
  for (const crossing of bp.streets.crossings) {
    const node = nodes.get(crossing.nodeId);
    if (!node) throw invariantFailure(`crossing references missing node ${crossing.nodeId}`);
    const used = new Set<string>();
    for (const segment of crossing.segments) {
      const edge = edges.get(segment.edgeId);
      if (!edge || !node.edgeIds.includes(segment.edgeId)) {
        throw invariantFailure(`crossing ${crossing.nodeId} references non-incident edge ${segment.edgeId}`);
      }
      if (used.has(segment.edgeId)) throw invariantFailure(`crossing ${crossing.nodeId} repeats edge ${segment.edgeId}`);
      used.add(segment.edgeId);
      if (edge.class === 'highway' || edge.class === 'alley') {
        throw invariantFailure(`crossing ${crossing.nodeId} enters ${edge.class} ${edge.id}`);
      }
      if (segment.width !== CROSSING.width || segment.markings.length === 0) {
        throw invariantFailure(`crossing ${crossing.nodeId}:${edge.id} has incomplete marking dimensions`);
      }
      const direction = normalize(sub(segment.to, segment.from));
      const along = perp(direction);
      const middle = scale(add(segment.from, segment.to), 0.5);
      for (const marking of segment.markings) {
        if (!isSimpleRing(marking)
          || Math.abs(area(marking) - edge.width * CROSSING.stripeLength) > 0.01) {
          throw invariantFailure(`crossing ${crossing.nodeId}:${edge.id} has an invalid stripe`);
        }
        const centerOffset = sub(centroid(marking), middle);
        const acrossOffset = dot(centerOffset, direction);
        const alongOffset = dot(centerOffset, along);
        if (Math.abs(acrossOffset) > POSITION_EPS
          || Math.abs(alongOffset) > segment.width / 2 + POSITION_EPS) {
          throw invariantFailure(
            `crossing ${crossing.nodeId}:${edge.id} stripe leaves its marking region`,
            { acrossOffset, alongOffset },
          );
        }
        let minAcross = Infinity;
        let maxAcross = -Infinity;
        let minAlong = Infinity;
        let maxAlong = -Infinity;
        for (const point of marking) {
          const relative = sub(point, middle);
          const acrossPosition = dot(relative, direction);
          const alongPosition = dot(relative, along);
          minAcross = Math.min(minAcross, acrossPosition);
          maxAcross = Math.max(maxAcross, acrossPosition);
          minAlong = Math.min(minAlong, alongPosition);
          maxAlong = Math.max(maxAlong, alongPosition);
        }
        if (Math.abs(maxAcross - minAcross - edge.width) > POSITION_EPS
          || Math.abs(maxAlong - minAlong - CROSSING.stripeLength) > POSITION_EPS
          || Math.max(Math.abs(minAlong), Math.abs(maxAlong)) > segment.width / 2 + POSITION_EPS) {
          throw invariantFailure(`crossing ${crossing.nodeId}:${edge.id} stripe does not fit its marking region`);
        }
      }
    }
  }
}
