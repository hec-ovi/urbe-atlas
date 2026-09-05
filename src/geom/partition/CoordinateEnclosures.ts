import { invariantFailure } from '../../errors';
import { PointPool, type Point } from './Exact';
import type { PartitionPointEnclosure } from './schema';

const bits = new DataView(new ArrayBuffer(8));
function adjacent(value: number, up: boolean): number {
  if (value === 0) return up ? Number.MIN_VALUE : -Number.MIN_VALUE;
  bits.setFloat64(0, value);
  bits.setBigUint64(0, bits.getBigUint64(0) + ((value > 0) === up ? 1n : -1n));
  return bits.getFloat64(0);
}

/** Tight bounds refer to the retained coordinate, independently of its displayed value. */
export class CoordinateEnclosures {
  private readonly binary = new PointPool();

  point(point: Point): PartitionPointEnclosure {
    const x = this.coordinate(point.x, point.w, point.value[0]);
    const y = this.coordinate(point.y, point.w, point.value[1]);
    return { lower: [x[0], y[0]], upper: [x[1], y[1]] };
  }

  private coordinate(numerator: bigint, denominator: bigint, displayed: number): [number, number] {
    const compare = (value: number) => {
      if (!Number.isFinite(value)) throw invariantFailure('partition enclosure exceeds finite numeric range');
      const numeric = this.binary.input([value, 0]);
      const difference = numeric.x * denominator - numerator * numeric.w;
      return difference < 0n ? -1 : difference > 0n ? 1 : 0;
    };
    const side = compare(displayed);
    if (!side) return [displayed, displayed];
    let bound = displayed;
    while (true) {
      const next = adjacent(bound, side < 0), direction = compare(next);
      if (!direction) return [next, next];
      if (direction !== side) return side < 0 ? [bound, next] : [next, bound];
      bound = next;
    }
  }
}
