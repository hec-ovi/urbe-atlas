import type { Polygon } from '../../schema/blueprint';
import type { GridFrame } from './GridFrame';
import { rowIntervals } from './PolygonRows';
import type { RectangleCandidate } from './RectangleCandidates';

/** Exact setback land in construction coordinates, with transform roundoff only. */
export class GridLand {
  readonly polygon: Polygon;
  readonly roundoff: number;

  constructor(inset: Polygon, frame: GridFrame) {
    this.polygon = inset.map((point) => frame.local(point));
    this.roundoff = frame.roundoff(inset);
  }

  contains({ u, v, width, depth }: RectangleCandidate, spacing: number): boolean {
    const left = u * spacing, right = (u + width) * spacing;
    return this.intervals(v * spacing, (v + depth) * spacing)
      .some(([a, b]) => left >= a - this.roundoff && right <= b + this.roundoff);
  }

  intervals(bottom: number, top: number) {
    // Reconstructing an exact boundary can differ by a few floating-point units.
    const polygon = this.polygon.map(([x, y]): [number, number] => [x,
      Math.abs(y - bottom) <= this.roundoff ? bottom : Math.abs(y - top) <= this.roundoff ? top : y]);
    return rowIntervals(polygon, bottom, top);
  }
}
