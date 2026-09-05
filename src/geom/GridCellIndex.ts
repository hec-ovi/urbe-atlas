import type { GridPoint } from './schema';

/** Sorted grid points keep local segment routing independent of city size. */
export class GridCellIndex {
  private readonly points: GridPoint[];

  constructor(points: GridPoint[]) {
    this.points = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  }

  near(a: GridPoint, b: GridPoint): GridPoint[] {
    const minX = Math.min(a.x, b.x) - 0.5, maxX = Math.max(a.x, b.x) + 0.5;
    const minY = Math.min(a.y, b.y) - 0.5, maxY = Math.max(a.y, b.y) + 0.5;
    let low = 0, high = this.points.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.points[mid].x < minX) low = mid + 1;
      else high = mid;
    }
    const found: GridPoint[] = [];
    for (let i = low; i < this.points.length && this.points[i].x <= maxX; i++) {
      const p = this.points[i];
      if (p.y >= minY && p.y <= maxY) found.push(p);
    }
    return found;
  }
}
