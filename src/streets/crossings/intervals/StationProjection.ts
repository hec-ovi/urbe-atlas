import type { Vec2 } from '../../../../schema/blueprint';
import type { PartitionPointEnclosure } from '../../../geom/partition/schema';
import { Directed, type Range } from './Directed';

/** Bounds the fraction of a point against both error-enclosed source-long sides. */
export class StationProjection {
  private readonly sides: { origin: Range; span: Range }[];

  constructor(private readonly direction: Vec2, sides: readonly (readonly [PartitionPointEnclosure, PartitionPointEnclosure])[]) {
    this.sides = sides.map(([from, to]) => {
      const origin = this.dot(from);
      return { origin, span: Directed.subtract(this.dot(to), origin) };
    });
  }

  fractions(polygon: readonly PartitionPointEnclosure[]): Range | null {
    let lower = Infinity, upper = -Infinity;
    for (const side of this.sides) {
      if (side.span[0] <= 0) return null;
      for (const point of polygon) {
        const fraction = Directed.divide(Directed.subtract(this.dot(point), side.origin), side.span);
        lower = Math.min(lower, fraction[0]);
        upper = Math.max(upper, fraction[1]);
      }
    }
    return [lower, upper];
  }

  private dot(point: PartitionPointEnclosure): Range {
    return Directed.add(
      Directed.multiply([point.lower[0], point.upper[0]], Directed.point(this.direction[0])),
      Directed.multiply([point.lower[1], point.upper[1]], Directed.point(this.direction[1])),
    );
  }
}
