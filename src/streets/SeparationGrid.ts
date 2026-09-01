/** Uniform hash grid over sample points for streamline separation tests. */
import type { Vec2 } from '../../schema/blueprint';
import { distSq } from '../geom/vec';

export class SeparationGrid {
  private readonly cell: number;
  private readonly cells = new Map<string, Vec2[]>();

  constructor(cellSize: number) {
    this.cell = cellSize;
  }

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  insert(p: Vec2): void {
    const k = this.key(Math.floor(p[0] / this.cell), Math.floor(p[1] / this.cell));
    const bucket = this.cells.get(k);
    if (bucket) bucket.push(p);
    else this.cells.set(k, [p]);
  }

  insertAll(points: readonly Vec2[]): void {
    for (const p of points) this.insert(p);
  }

  /**
   * Nearest stored point within radius r of p, or null.
   * `accept` narrows the candidates, e.g. to points ahead of a traced line.
   */
  nearestWithin(p: Vec2, r: number, accept?: (q: Vec2) => boolean): Vec2 | null {
    const r2 = r * r;
    const span = Math.ceil(r / this.cell);
    const cx = Math.floor(p[0] / this.cell);
    const cz = Math.floor(p[1] / this.cell);
    let best: Vec2 | null = null;
    let bestD2 = r2;
    for (let dx = -span; dx <= span; dx++) {
      for (let dz = -span; dz <= span; dz++) {
        const bucket = this.cells.get(this.key(cx + dx, cz + dz));
        if (!bucket) continue;
        for (const q of bucket) {
          const d2 = distSq(p, q);
          if (d2 > bestD2) continue;
          if (accept && !accept(q)) continue;
          bestD2 = d2;
          best = q;
        }
      }
    }
    return best;
  }

  hasWithin(p: Vec2, r: number): boolean {
    return this.nearestWithin(p, r) !== null;
  }
}
