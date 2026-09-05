import { orientation, winding } from './orientation';
import type { Polygon, Vec2 } from './schema';

const same = (a: Vec2, b: Vec2): boolean => a[0] === b[0] && a[1] === b[1];
const between = (p: Vec2, a: Vec2, b: Vec2): boolean => p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0])
  && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);

/** Membership includes the boundary, without constructing a ray intersection. */
function coversPoint(polygon: Polygon, point: Vec2): boolean {
  let inside = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const side = orientation(a, b, point);
    if (side === 0 && between(point, a, b)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && (b[1] > a[1] ? side > 0 : side < 0)) inside = !inside;
  }
  return inside;
}

/** At a convex corner both half-planes contain the interior; at a reflex corner either does. */
function inwardAtVertex(polygon: Polygon, index: number, point: Vec2, sign: number): boolean {
  const prev = polygon[(index + polygon.length - 1) % polygon.length];
  const vertex = polygon[index], next = polygon[(index + 1) % polygon.length];
  const incoming = sign * orientation(prev, vertex, point);
  const outgoing = sign * orientation(vertex, next, point);
  return sign * orientation(prev, vertex, next) < 0 ? incoming >= 0 || outgoing >= 0 : incoming >= 0 && outgoing >= 0;
}

export function coversSegment(polygon: Polygon, a: Vec2, b: Vec2): boolean {
  if (polygon.length < 3 || !coversPoint(polygon, a) || !coversPoint(polygon, b)) return false;
  if (same(a, b)) return true;
  const sign = winding(polygon);
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length];
    const pa = orientation(p, q, a), pb = orientation(p, q, b);
    const ap = orientation(a, b, p), aq = orientation(a, b, q);
    if (pa * pb < 0 && ap * aq < 0) return false;
    if (pa === 0 && !same(a, p) && !same(a, q) && between(a, p, q) && sign * pb < 0) return false;
    if (pb === 0 && !same(b, p) && !same(b, q) && between(b, p, q) && sign * pa < 0) return false;
    if (ap === 0 && between(p, a, b)
      && (!inwardAtVertex(polygon, i, a, sign) || !inwardAtVertex(polygon, i, b, sign))) return false;
  }
  return true;
}

export function coversPath(polygon: Polygon, path: Vec2[]): boolean {
  if (path.length === 0) return false;
  if (path.length === 1) return coversSegment(polygon, path[0], path[0]);
  for (let i = 1; i < path.length; i++) if (!coversSegment(polygon, path[i - 1], path[i])) return false;
  return true;
}
