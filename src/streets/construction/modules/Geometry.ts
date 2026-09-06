import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import type { ModulePrism, ModuleRole, QuarterTurn } from './schema';

export const DIMENSIONS = { joint: 0.012, pavedTop: 0.2, bedTop: 0.18, curb: 0.2, gutter: 0.3, lip: 0.02, radius: 2 } as const;

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

/** Clips only the fixed convex corner template against one panel boundary. */
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

export function clipCell(template: Polygon, x: number, z: number): Polygon {
  const cell = rectangle(x, z, 1, 1);
  return cell.reduce((polygon, a, index) => halfPlane(polygon, a, cell[(index + 1) % 4], 0), template);
}

export function insetBody(polygon: Polygon): Polygon {
  return polygon.reduce((body, a, index) => halfPlane(body, a, polygon[(index + 1) % polygon.length], DIMENSIONS.joint / 2), polygon);
}

/** Shared corner angles include grid intersections and limit curved facets to 0.5 m. */
export const CORNER_ANGLES = Array.from({ length: 13 }, (_, i) => Math.PI + i * Math.PI / 24);

export function arc(radius: number, angles = CORNER_ANGLES): Polygon {
  return angles.map(angle => angle === Math.PI ? [DIMENSIONS.radius - radius, DIMENSIONS.radius]
    : angle === Math.PI * 1.5 ? [DIMENSIONS.radius, DIMENSIONS.radius - radius]
      : [DIMENSIONS.radius + radius * Math.cos(angle), DIMENSIONS.radius + radius * Math.sin(angle)]);
}

export function ringPart(inner: number, outer: number, angles = CORNER_ANGLES, jointAngle = 0): Polygon {
  const polygon = [...arc(outer, angles), ...arc(inner, angles).reverse()];
  if (!jointAngle) return polygon;
  const center: Vec2 = [DIMENSIONS.radius, DIMENSIONS.radius];
  const [start, end] = arc(1, [angles[0] + jointAngle, angles[angles.length - 1] - jointAngle]);
  return halfPlane(halfPlane(polygon, center, start, 0), end, center, 0);
}
