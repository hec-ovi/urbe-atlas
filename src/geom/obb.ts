/** Minimum-area oriented bounding box via rotating calipers over the convex hull. */
import type { Polygon, Vec2 } from '../../schema/blueprint';

export interface OBB {
  center: Vec2;
  /** Unit direction of the long axis. */
  axis: Vec2;
  /** Full extents: length along axis, width across. length >= width. */
  length: number;
  width: number;
}

function convexHull(points: readonly Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 2) return pts;
  const cross = (o: Vec2, a: Vec2, b: Vec2): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

export function orientedBoundingBox(poly: Polygon): OBB {
  const hull = convexHull(poly);
  let best: OBB | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const el = Math.hypot(ex, ez);
    if (el < 1e-9) continue;
    const ux = ex / el;
    const uz = ez / el;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of hull) {
      const u = p[0] * ux + p[1] * uz;
      const v = -p[0] * uz + p[1] * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const du = maxU - minU;
    const dv = maxV - minV;
    const area = du * dv;
    if (area < bestArea) {
      bestArea = area;
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      const center: Vec2 = [cu * ux - cv * uz, cu * uz + cv * ux];
      best =
        du >= dv
          ? { center, axis: [ux, uz], length: du, width: dv }
          : { center, axis: [-uz, ux], length: dv, width: du };
    }
  }
  return best ?? { center: poly[0] ?? [0, 0], axis: [1, 0], length: 0, width: 0 };
}
