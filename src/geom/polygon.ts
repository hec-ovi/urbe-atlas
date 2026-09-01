import type { Polygon, Vec2 } from '../../schema/blueprint';

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
