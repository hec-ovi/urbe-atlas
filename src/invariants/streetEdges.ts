/**
 * Street edges must be real runs of road: two distinct nodes, no repeated
 * point, and a centerline that never folds back over its own sidewalk band.
 * A folded edge renders as a curb-raised sliver lying across the roadway.
 */
import type { CityBlueprint } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { length as lineLength } from '../geom/polyline';
import { dist } from '../geom/vec';
import { MAX_TURN_DEG, foldAt } from '../streets/centerline';

export function checkStreetEdges(bp: CityBlueprint): void {
  for (const e of bp.streets.edges) {
    if (e.from === e.to) {
      throw invariantFailure(`edge ${e.id} leaves and returns to node ${e.from}`);
    }
    if (e.path.length < 2 || lineLength(e.path) <= 0) {
      throw invariantFailure(`edge ${e.id} has no length`, { path: e.path });
    }
    for (let i = 1; i < e.path.length; i++) {
      if (dist(e.path[i - 1], e.path[i]) <= 0) {
        throw invariantFailure(`edge ${e.id} repeats its path point ${i}`, { point: e.path[i] });
      }
    }
    const fold = foldAt(e.path);
    if (fold >= 0) {
      throw invariantFailure(
        `edge ${e.id} folds back on itself at path point ${fold} (turn over ${MAX_TURN_DEG} degrees)`,
        { point: e.path[fold] },
      );
    }
  }
}
