import type { Polygon } from '../../schema/blueprint';

export type Interval = readonly [number, number];

/** Horizontal intervals that remain inside a polygon across a complete row. */
export function rowIntervals(polygon: Polygon, bottom: number, top: number): Interval[] {
  const levels = [bottom, top];
  for (const [, y] of polygon) {
    if (y > bottom && y < top) levels.push(y);
  }
  levels.sort((a, b) => a - b);
  let spans: Interval[] | undefined;
  for (let index = 1; index < levels.length; index++) {
    if (levels[index] === levels[index - 1]) continue;
    const strip = stripIntervals(polygon, levels[index - 1], levels[index]);
    spans = spans ? intersect(spans, strip) : strip;
    if (!spans.length) return [];
  }
  return spans ?? [];
}

/** Between vertex heights, each side is linear and reaches its extremes at the ends. */
function stripIntervals(polygon: Polygon, bottom: number, top: number): Interval[] {
  const sides: Interval[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if (Math.min(a[1], b[1]) > bottom || Math.max(a[1], b[1]) < top || a[1] === b[1]) continue;
    const slope = (b[0] - a[0]) / (b[1] - a[1]);
    sides.push([a[0] + (bottom - a[1]) * slope, a[0] + (top - a[1]) * slope]);
  }
  sides.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
  const spans: Interval[] = [];
  for (let i = 0; i + 1 < sides.length; i += 2) {
    const left = Math.max(...sides[i]), right = Math.min(...sides[i + 1]);
    if (right > left) spans.push([left, right]);
  }
  return spans;
}

function intersect(a: Interval[], b: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const left of a) for (const right of b) {
    const low = Math.max(left[0], right[0]), high = Math.min(left[1], right[1]);
    if (high > low) result.push([low, high]);
  }
  return result;
}
