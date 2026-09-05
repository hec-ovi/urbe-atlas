import { invariantFailure } from '../../errors';
import { normalizeRing, type PointPool, type Ring } from './Exact';
import { chain, nodeSegments, segments } from './Segments';
import type { Polygon } from './schema';

/** Input validation is independent of the later ownership classification. */
export function readRing(polygon: Polygon, pool: PointPool): Ring {
  return readExactRing(polygon.map(point => pool.input(point)), pool);
}

export function readExactRing(points: Ring, pool: PointPool): Ring {
  const ring = normalizeRing(points);
  if (new Set(ring.map(point => point.key)).size !== ring.length) throw invariantFailure('partition input ring repeats a vertex');
  const edges = segments([ring]);
  nodeSegments(edges, pool);
  if (edges.some(edge => chain(edge).length > 2)) throw invariantFailure('partition input ring crosses or touches itself');
  return ring;
}
