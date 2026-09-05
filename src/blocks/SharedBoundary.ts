import type { Polygon, Polyline, Vec2 } from '../../schema/blueprint';
import { closestOnSegment, dist } from '../geom/vec';
import { bufferLine, GRID_STEP } from '../geom/clip';

/** Source lines shared by two blocks retain their exact position through cleanup and rounding. */
export class SharedBoundary {
  constructor(private readonly lines: Polyline[]) {}

  band(width: number): Polygon[] {
    return this.lines.flatMap((line) => bufferLine(line, width));
  }

  contains(point: Vec2, tolerance = GRID_STEP * 2): boolean {
    return this.lines.some((line) => line.slice(1).some((end, index) =>
      dist(point, closestOnSegment(point, line[index], end).point) <= tolerance,
    ));
  }

  /** Removing a convex vertex only shrinks land; a shared source vertex always stays. */
  clean(ring: Polygon, minRun: number, pedestrianWidth: number): Polygon {
    const out = ring.map((point) => [...point] as Vec2);
    let changed = true;
    while (changed && out.length > 3) {
      changed = false;
      for (let i = 0; i < out.length; i++) {
        const a = out[i];
        const b = out[(i + 1) % out.length];
        const c = out[(i + 2) % out.length];
        if (dist(a, b) >= minRun || this.contains(a, pedestrianWidth) || this.contains(b, pedestrianWidth)) continue;
        const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (turn < 0) continue;
        out.splice((i + 1) % out.length, 1);
        changed = true;
        break;
      }
    }
    return out;
  }
}
