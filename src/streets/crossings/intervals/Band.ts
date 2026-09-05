import type { Polygon } from '../../../../schema/blueprint';
import { numericSweepEnvelope } from '../../../geom/NumericSweep';
import type { PartitionPointEnclosure } from '../../../geom/partition/schema';
import { StationFrame } from './StationFrame';
import { StationProjection } from './StationProjection';
import type { Range } from './Directed';
import type { StationIntervalInput } from './schema';

interface Bounds { minX: number; minZ: number; maxX: number; maxZ: number }

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
    this.bounds = bounds(this.polygon);
  }

  candidates(polygons: Polygon[], padding = 0): Polygon[] {
    return polygons.filter(polygon => {
      const other = bounds(polygon);
      return other.minX <= this.bounds.maxX + padding && other.maxX >= this.bounds.minX - padding
        && other.minZ <= this.bounds.maxZ + padding && other.maxZ >= this.bounds.minZ - padding;
    });
  }

  fractions(polygon: readonly PartitionPointEnclosure[]): Range | null {
    return this.projection.fractions(polygon);
  }
}

function bounds(polygon: Polygon): Bounds {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of polygon) {
    minX = Math.min(minX, x); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxZ = Math.max(maxZ, z);
  }
  return { minX, minZ, maxX, maxZ };
}
