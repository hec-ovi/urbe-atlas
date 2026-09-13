/** Parallel navigation centerlines beside a street path. */
import type { Polyline, Vec2 } from '../../schema/blueprint';
import { GRID_STEP } from '../geom/clip';
import { add, normalize, perp, scale, sub } from '../geom/vec';

/** Metres, to the blueprint's 1 mm grid. */
export const round = (value: number): number => Math.round(value / GRID_STEP) * GRID_STEP;

const point = (value: Vec2): Vec2 => [round(value[0]), round(value[1])];

/**
 * The line `offset` metres to the left of `line`, vertex for vertex. Corners
 * keep their mitre, so the result runs parallel to its source along every
 * segment. A zero offset returns the line itself.
 */
export function parallel(line: Polyline, offset: number): Polyline {
  if (offset === 0) return line.map(point);
  const normals = line.slice(1).map((end, index) => perp(normalize(sub(end, line[index]))));
  return line.map((vertex, index) => {
    const before = normals[index - 1];
    const after = normals[index];
    if (!before) return point(add(vertex, scale(after, offset)));
    if (!after) return point(add(vertex, scale(before, offset)));
    const mean = add(before, after);
    const scaleFactor = (mean[0] ** 2 + mean[1] ** 2) / 2;
    // Mitre: the bisector stretched so both offset segments stay `offset` away.
    return point(scaleFactor < 1e-9
      ? add(vertex, scale(before, offset))
      : add(vertex, scale(mean, offset / scaleFactor)));
  });
}
