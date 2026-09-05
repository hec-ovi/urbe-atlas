import { invariantFailure } from '../../errors';
import { PointPool, type Point, type Ring } from './Exact';
import { readExactRing } from './RingInput';
import type { PartitionEdgeMask, PartitionEdgeMaskInput, PartitionEdgePosition, PartitionEdgePositionInput, Polygon, Vec2 } from './schema';

function construct(position: PartitionEdgePosition, pool: PointPool): Point {
  if (!position || ![position.from, position.to].every(point => Array.isArray(point) && point.length === 2)
    || !Number.isFinite(position.t)) throw invariantFailure('partition edge position is malformed');
  return pool.affine(pool.input(position.from), pool.input(position.to), position.t);
}

export function readEdgeMask(mask: PartitionEdgeMask, pool: PointPool): Ring {
  return readExactRing(mask.map(position => construct(position, pool)), pool);
}

export function edgePositionView(input: PartitionEdgePositionInput): Vec2 {
  return [...construct(input.position, new PointPool().reader(input.encoding)).value];
}

/** The original vertex order belongs to the caller's station and side convention. */
export function edgeMaskView(input: PartitionEdgeMaskInput): Polygon {
  const pool = new PointPool().reader(input.encoding), ring = input.mask.map(position => construct(position, pool));
  readExactRing(ring, pool);
  return ring.map(point => [...point.value]);
}
