import type { GridPoint } from './schema';

/** Sorted grid points keep local segment routing independent of city size. */
export class GridCellIndex {
  private readonly points: GridPoint[];

  constructor(points: GridPoint[]) {
    this.points = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  }

  /** Visits the same points as `near`, in the same order, without building an array. */
  forEachNear(a: GridPoint, b: GridPoint, visit: (point: GridPoint) => void): void {
    const minX = (a.x < b.x ? a.x : b.x) - 0.5, maxX = (a.x < b.x ? b.x : a.x) + 0.5;
    const minY = (a.y < b.y ? a.y : b.y) - 0.5, maxY = (a.y < b.y ? b.y : a.y) + 0.5;
    let low = 0, high = this.points.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.points[mid].x < minX) low = mid + 1;
      else high = mid;
    }
    for (let i = low; i < this.points.length && this.points[i].x <= maxX; i++) {
      const p = this.points[i];
      if (p.y >= minY && p.y <= maxY) visit(p);
    }
  }

  near(a: GridPoint, b: GridPoint): GridPoint[] {
    const found: GridPoint[] = [];
    this.forEachNear(a, b, (point) => { found.push(point); });
    return found;
  }
}
