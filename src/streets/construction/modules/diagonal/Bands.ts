import type { Polygon } from '../../../../../schema/blueprint';

/** Joins existing extreme vertices to split one convex annulus without new edge points. */
export function band(outer: Polygon, inner: Polygon): Polygon[] {
  const extreme = (polygon: Polygon, sign: number): number => polygon.reduce((best, point, index) =>
    sign * point[0] > sign * polygon[best][0]
      || point[0] === polygon[best][0] && point[1] < polygon[best][1] ? index : best, 0);
  const chain = (polygon: Polygon, from: number, to: number): Polygon =>
    Array.from({ length: (to - from + polygon.length) % polygon.length + 1 },
      (_, index) => polygon[(from + index) % polygon.length]);
  const left = [extreme(outer, -1), extreme(inner, -1)];
  const right = [extreme(outer, 1), extreme(inner, 1)];
  return [
    [...chain(outer, left[0], right[0]), ...chain(inner, left[1], right[1]).reverse()],
    [...chain(outer, right[0], left[0]), ...chain(inner, right[1], left[1]).reverse()],
  ];
}
