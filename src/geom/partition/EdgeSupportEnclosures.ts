import { invariantFailure } from '../../errors';
import { CoordinateEnclosures } from './CoordinateEnclosures';
import { PointPool } from './Exact';
import type { PartitionEdgeSupportEnclosure, PartitionEdgeSupportInput } from './schema';

/** Endpoint boxes enclose nearest-rounded affine views over the complete unit interval. */
export function edgeSupportEnclosures(input: PartitionEdgeSupportInput): PartitionEdgeSupportEnclosure {
  if (input.encoding !== 'authored-1mm' || ![input.from, input.to].every(point => Array.isArray(point) && point.length === 2)) {
    throw invariantFailure('partition support enclosure requires authored coordinate pairs');
  }
  const pool = new PointPool(1000), points = [pool.input(input.from), pool.input(input.to)];
  const enclosures = new CoordinateEnclosures();
  const result: PartitionEdgeSupportEnclosure = {
    from: { lower: [...input.from], upper: [...input.from] }, to: { lower: [...input.to], upper: [...input.to] },
  };
  const scale = 1000n, precision = 1n << 53n, denominator = scale * precision;
  for (const axis of [0, 1] as const) {
    const coordinates = points.map(point => (axis ? point.y : point.x) * scale / point.w);
    if (coordinates[0] === coordinates[1]) continue;
    const magnitudes = coordinates.map(value => value < 0n ? -value : value);
    const maximum = magnitudes[0] > magnitudes[1] ? magnitudes[0] : magnitudes[1];
    // A varying authored axis has maximum >= 1 mm, also bounding subnormal rounding.
    for (const [index, endpoint] of [result.from, result.to].entries()) {
      endpoint.lower[axis] = enclosures.point(pool.make(coordinates[index] * precision - maximum, 0n, denominator)).lower[0];
      endpoint.upper[axis] = enclosures.point(pool.make(coordinates[index] * precision + maximum, 0n, denominator)).upper[0];
    }
  }
  return result;
}
