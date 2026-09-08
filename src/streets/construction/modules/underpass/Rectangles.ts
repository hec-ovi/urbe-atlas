import type { Polygon } from '../../../../../schema/blueprint';
import { invariantFailure } from '../../../../errors';
import { pointInPolygon } from '../../../../geom/polygon';

export interface Rectangle { x: number; z: number; width: number; depth: number }

/** Rectangular runs retain every authored band edge without triangulated seams. */
export function rectangles(polygons: Polygon[]): Rectangle[] {
  const result: Rectangle[] = [];
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i++) {
      const next = polygon[(i + 1) % polygon.length];
      if (polygon[i][0] !== next[0] && polygon[i][1] !== next[1]) {
        throw invariantFailure('underpass resolved bands must be orthogonal');
      }
    }
    const xs = [...new Set(polygon.map(point => point[0]))].sort((a, b) => a - b);
    const zs = [...new Set(polygon.map(point => point[1]))].sort((a, b) => a - b);
    let previous = new Map<string, Rectangle>();
    for (let zi = 0; zi < zs.length - 1; zi++) {
      const row = new Map<string, Rectangle>();
      for (let xi = 0; xi < xs.length - 1; xi++) {
        if (!pointInPolygon([(xs[xi] + xs[xi + 1]) / 2, (zs[zi] + zs[zi + 1]) / 2], polygon)) continue;
        const left = xs[xi];
        while (xi + 1 < xs.length - 1 && pointInPolygon([
          (xs[xi + 1] + xs[xi + 2]) / 2, (zs[zi] + zs[zi + 1]) / 2,
        ], polygon)) xi++;
        const width = xs[xi + 1] - left, key = `${left}:${width}`;
        const existing = previous.get(key);
        if (existing) {
          existing.depth = zs[zi + 1] - existing.z;
          row.set(key, existing);
        } else {
          const rect = { x: left, z: zs[zi], width, depth: zs[zi + 1] - zs[zi] };
          result.push(rect);
          row.set(key, rect);
        }
      }
      previous = row;
    }
  }
  return result;
}
