import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import type { ModulePrism, ModuleRole, QuarterTurn } from './schema';

export const DIMENSIONS = { joint: 0.012, pavedTop: 0.2, bedTop: 0.18, curb: 0.2, gutter: 0.3, lip: 0.02 } as const;

export function rectangle(x: number, z: number, width: number, depth: number): Polygon {
  return [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]];
}

export function transform([x, z]: Vec2, origin: Vec2, turn: QuarterTurn): Vec2 {
  const rotations: Vec2[] = [[x, z], [-z, x], [-x, -z], [z, -x]];
  const p = rotations[turn];
  return [origin[0] + p[0], origin[1] + p[1]];
}

export function prism(role: ModuleRole, polygon: Polygon, bottom: number, top: number): ModulePrism {
  return { role, polygon, bottom, top };
}

/** Clips a convex template against one panel boundary. */
function halfPlane(polygon: Polygon, a: Vec2, b: Vec2, inset: number): Polygon {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const shift = inset * Math.hypot(dx, dz);
  const distance = (p: Vec2) => dx * (p[1] - a[1]) - dz * (p[0] - a[0]) - shift;
  const out: Polygon = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length];
    const dp = distance(p), dq = distance(q);
    if (dp >= 0) out.push(p);
    if ((dp > 0 && dq < 0) || (dp < 0 && dq > 0)) {
      const t = dp / (dp - dq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

/**
 * The visible body of a curb or gutter band: the band pulled back by half a
 * joint at each end of its run, and by `road` on its road side (the low side
 * of its short axis).
 */
export function bandBody(band: Polygon, road = 0): Polygon {
  const [x0, z0] = band[0], [x1, z1] = band[2], half = DIMENSIONS.joint / 2;
  return x1 - x0 >= z1 - z0
    ? rectangle(x0 + half, z0 + road, x1 - x0 - DIMENSIONS.joint, z1 - z0 - road)
    : rectangle(x0 + road, z0 + half, x1 - x0 - road, z1 - z0 - DIMENSIONS.joint);
}

/** The lip strip of a gutter band, on its road side. */
export function roadLip(band: Polygon): Polygon {
  const [x0, z0] = band[0], [x1, z1] = band[2], half = DIMENSIONS.joint / 2;
  return x1 - x0 >= z1 - z0
    ? rectangle(x0 + half, z0, x1 - x0 - DIMENSIONS.joint, DIMENSIONS.lip)
    : rectangle(x0, z0 + half, DIMENSIONS.lip, z1 - z0 - DIMENSIONS.joint);
}

export function insetBody(polygon: Polygon): Polygon {
  return polygon.reduce((body, a, index) => halfPlane(body, a, polygon[(index + 1) % polygon.length], DIMENSIONS.joint / 2), polygon);
}

/** Opens the two station joints of a band without shifting its shared side faces. */
export function jointedBand(polygon: Polygon): Polygon {
  return halfPlane(halfPlane(polygon, polygon[0], polygon[1], DIMENSIONS.joint / 2), polygon[2], polygon[3], DIMENSIONS.joint / 2);
}
