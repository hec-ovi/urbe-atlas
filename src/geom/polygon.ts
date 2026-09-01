import type { Polygon, Vec2 } from '../../schema/blueprint';
import { closestOnSegment, dist } from './vec';

/** Signed area; positive = CCW. */
export function signedArea(poly: Polygon): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    s += x1 * z2 - x2 * z1;
  }
  return s / 2;
}

export const area = (poly: Polygon): number => Math.abs(signedArea(poly));

export function ensureCCW(poly: Polygon): Polygon {
  return signedArea(poly) >= 0 ? poly : [...poly].reverse();
}

export function centroid(poly: Polygon): Vec2 {
  const a = signedArea(poly);
  if (Math.abs(a) < 1e-9) {
    let x = 0;
    let z = 0;
    for (const p of poly) {
      x += p[0];
      z += p[1];
    }
    return [x / poly.length, z / poly.length];
  }
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    const f = x1 * z2 - x2 * z1;
    cx += (x1 + x2) * f;
    cz += (z1 + z2) * f;
  }
  return [cx / (6 * a), cz / (6 * a)];
}

export function pointInPolygon(p: Vec2, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function bounds(points: readonly Vec2[]): { min: Vec2; max: Vec2 } {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    if (x < minX) minX = x;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (z > maxZ) maxZ = z;
  }
  return { min: [minX, minZ], max: [maxX, maxZ] };
}

/** A ring is valid when it has 3+ points, real area and no crossing edges. */
export function isSimpleRing(poly: Polygon): boolean {
  const n = poly.length;
  if (n < 3 || area(poly) <= 1e-9) return false;
  for (let i = 0; i < n; i++) {
    const a1 = poly[i];
    const a2 = poly[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // segments sharing a vertex
      if (segmentsCross(a1, a2, poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}

/** True when two segments cross at a point interior to both. */
function segmentsCross(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const d1 = side(b1, b2, a1);
  const d2 = side(b1, b2, a2);
  const d3 = side(a1, a2, b1);
  const d4 = side(a1, a2, b2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function side(a: Vec2, b: Vec2, p: Vec2): number {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}

/** Longest edge index of the polygon. */
export function longestEdge(poly: Polygon): number {
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const l = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    if (l > bestLen) {
      bestLen = l;
      best = i;
    }
  }
  return best;
}

/** Distance from a point to the polygon's outline (0 on it, positive inside and out). */
export function distanceToOutline(p: Vec2, poly: Polygon): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const { point } = closestOnSegment(p, poly[i], poly[(i + 1) % poly.length]);
    best = Math.min(best, dist(p, point));
  }
  return best;
}
