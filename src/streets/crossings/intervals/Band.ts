import type { Polygon } from '../../../../schema/blueprint';
import { numericSweepEnvelope } from '../../../geom/NumericSweep';
import type { PartitionPointEnclosure } from '../../../geom/partition/schema';
import { StationFrame } from './StationFrame';
import { StationProjection } from './StationProjection';
import { Bounds } from './Bounds';
import type { Range } from './Directed';
import type { StationIntervalInput } from './schema';

/** Numeric query envelope and fraction bounds share the same source-side error boxes. */
export class Band {
  readonly length: number;
  readonly polygon: Polygon;
  private readonly bounds: Bounds;
  private readonly projection: StationProjection;

  constructor(input: StationIntervalInput) {
    const frame = new StationFrame(input.a, input.b);
    this.length = frame.length;
    const [min, max] = input.lateral;
    const envelope = numericSweepEnvelope({
      sides: [
        { from: frame.edgePoint(0, min), to: frame.edgePoint(this.length, min) },
        { from: frame.edgePoint(0, max), to: frame.edgePoint(this.length, max) },
      ],
      encoding: 'authored-1mm',
    });
    this.polygon = envelope.polygon;
    this.projection = new StationProjection(frame.u, envelope.sides.map(side => [side.from, side.to]));
    this.bounds = new Bounds(this.polygon);
  }

  candidates(polygons: Polygon[], padding = 0): Polygon[] {
    return this.bounds.candidates(polygons, padding);
  }

  fractions(polygon: readonly PartitionPointEnclosure[]): Range | null {
    return this.projection.fractions(polygon);
  }
}
