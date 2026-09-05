import type { Polygon } from '../../../../schema/blueprint';

/** Closed coordinate bounds only reject geometrically disjoint masks. */
export class Bounds {
  private minX = Infinity;
  private minZ = Infinity;
  private maxX = -Infinity;
  private maxZ = -Infinity;

  constructor(polygon: Polygon) {
    for (const [x, z] of polygon) {
      this.minX = Math.min(this.minX, x); this.minZ = Math.min(this.minZ, z);
      this.maxX = Math.max(this.maxX, x); this.maxZ = Math.max(this.maxZ, z);
    }
  }

  candidates(polygons: Polygon[], padding = 0): Polygon[] {
    return polygons.filter(polygon => {
      const other = new Bounds(polygon);
      return other.minX <= this.maxX + padding && other.maxX >= this.minX - padding
        && other.minZ <= this.maxZ + padding && other.maxZ >= this.minZ - padding;
    });
  }
}
