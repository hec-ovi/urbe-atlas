import type { BuildingGrid, Polygon, Vec2 } from '../../schema/blueprint';
import { bounds } from '../geom/polygon';
import type { RectangleCandidate } from './RectangleCandidates';

/** Shared construction-cell coordinates and published world corners. */
export class GridFrame {
  private readonly cosine: number;
  private readonly sine: number;

  constructor(private readonly grid: BuildingGrid) {
    this.cosine = Math.cos(grid.angle);
    this.sine = Math.sin(grid.angle);
  }

  local([x, z]: Vec2): Vec2 {
    x -= this.grid.origin[0]; z -= this.grid.origin[1];
    return [x * this.cosine + z * this.sine, -x * this.sine + z * this.cosine];
  }

  /** Floating-point error budget for world translation and the two-axis transform. */
  roundoff(polygon: Polygon): number {
    const magnitude = Math.max(1, ...this.grid.origin.map(Math.abs), ...polygon.flat().map(Math.abs));
    return 16 * Number.EPSILON * magnitude;
  }

  polygon({ u, v, width, depth }: RectangleCandidate): Polygon {
    return [[u, v], [u + width, v], [u + width, v + depth], [u, v + depth]]
      .map(([x, y]) => {
        x *= this.grid.spacing; y *= this.grid.spacing;
        return [this.grid.origin[0] + x * this.cosine - y * this.sine,
          this.grid.origin[1] + x * this.sine + y * this.cosine];
      });
  }

  candidate(footprint: Polygon): RectangleCandidate {
    const box = bounds(footprint.map((point) => this.local(point)
      .map((coordinate) => Math.round(coordinate / this.grid.spacing)) as Vec2));
    return { u: box.min[0], v: box.min[1], width: box.max[0] - box.min[0], depth: box.max[1] - box.min[1] };
  }
}
