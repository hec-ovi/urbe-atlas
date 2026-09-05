/** Minimum-area oriented bounding box via rotating calipers over the convex hull. */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import { convexHull } from './ConvexHull';

export interface OBB {
  center: Vec2;
  /** Unit direction of the long axis. */
  axis: Vec2;
  /** Full extents: length along axis, width across. length >= width. */
  length: number;
  width: number;
}

const floatingTurn = (origin: Vec2, a: Vec2, b: Vec2): number =>
  (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);

export function orientedBoundingBox(poly: Polygon): OBB {
  const hull = convexHull(poly, floatingTurn);
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
