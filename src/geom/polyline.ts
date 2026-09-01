import type { Polyline, Vec2 } from '../../schema/blueprint';
import { dist, lerp, sub, scale, add, closestOnSegment } from './vec';

export function length(line: Polyline): number {
  let l = 0;
  for (let i = 1; i < line.length; i++) l += dist(line[i - 1], line[i]);
  return l;
}

/** Point at arc-length distance d along the line, clamped to its ends. */
export function pointAt(line: Polyline, d: number): Vec2 {
  if (d <= 0) return line[0];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const seg = dist(line[i - 1], line[i]);
    if (acc + seg >= d) return lerp(line[i - 1], line[i], (d - acc) / seg);
    acc += seg;
  }
  return line[line.length - 1];
}

/** Ramer-Douglas-Peucker simplification. */
export function simplify(line: Polyline, tolerance: number): Polyline {
  if (line.length <= 2) return line;
  const keep = new Array<boolean>(line.length).fill(false);
  keep[0] = keep[line.length - 1] = true;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const { point } = closestOnSegment(line[i], line[start], line[end]);
      const d = dist(line[i], point);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > tolerance && maxIdx > 0) {
      keep[maxIdx] = true;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/** Direction of the line at arc-length d (unit vector of the containing segment). */
export function directionAt(line: Polyline, d: number): Vec2 {
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const seg = dist(line[i - 1], line[i]);
    if (acc + seg >= d || i === line.length - 1) {
      const v = sub(line[i], line[i - 1]);
      const l = Math.hypot(v[0], v[1]);
      return l < 1e-12 ? [1, 0] : scale(v, 1 / l);
    }
    acc += seg;
  }
  return [1, 0];
}

/** Distance from a point to the closest point of the line. */
export function distanceTo(line: Polyline, p: Vec2): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const { point } = closestOnSegment(p, line[i - 1], line[i]);
    best = Math.min(best, dist(p, point));
  }
  return best;
}

/** Offset a point sideways from the line position at arc-length d. Positive = left of travel. */
export function offsetAt(line: Polyline, d: number, side: number): Vec2 {
  const p = pointAt(line, d);
  const dir = directionAt(line, d);
  return add(p, scale([-dir[1], dir[0]], side));
}
