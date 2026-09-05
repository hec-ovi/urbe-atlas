import type { Polygon, Vec2 } from '../schema/blueprint';

/** Independent area oracle clips the land to a rectangle without coordinate quantization. */
export function rectangleCoverageGap(polygon: Polygon, min: Vec2, max: Vec2): number {
  const width = max[0] - min[0], depth = max[1] - min[1];
  let clipped = polygon.map(([x, y]): Vec2 => [x - min[0], y - min[1]]);
  for (const [axis, limit, sign] of [[0, 0, 1], [0, width, -1], [1, 0, 1], [1, depth, -1]]) {
    const result: Polygon = [];
    for (let index = 0; index < clipped.length; index++) {
      const a = clipped[index], b = clipped[(index + 1) % clipped.length];
      const aInside = sign * (a[axis] - limit) >= 0, bInside = sign * (b[axis] - limit) >= 0;
      if (aInside) result.push(a);
      if (aInside !== bInside) {
        const t = (limit - a[axis]) / (b[axis] - a[axis]);
        result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    clipped = result;
  }
  const covered = Math.abs(clipped.reduce((sum, a, index) => {
    const b = clipped[(index + 1) % clipped.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0)) / 2;
  return width * depth - covered;
}
