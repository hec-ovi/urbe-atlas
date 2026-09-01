/**
 * Corner fillets: a sharp convex corner of a ring becomes an arc tangent to
 * both edges, which is how a curb turns around a street intersection. Gentle
 * bends (a curved street polyline) and corners without room for the tangents
 * stay as they are.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import { snap } from './clip';
import { signedArea } from './polygon';
import { dist } from './vec';

/** Corners turning less than this keep their vertex. */
const MIN_TURN = (35 * Math.PI) / 180;
/** Arc resolution, radians per segment. */
const ARC_STEP = (18 * Math.PI) / 180;
/** An arc below this radius is not worth its vertices. */
const MIN_RADIUS = 0.6;
/** Share of an edge one corner may consume, so two corners never overlap. */
const MAX_EDGE_SHARE = 0.4;

/** Ring with its convex corners rounded; radiusAt supplies the radius per rounded corner. */
export function filletCorners(ring: Polygon, radiusAt: () => number): Polygon {
  if (ring.length < 3) return ring;
  const ccw = signedArea(ring) >= 0;
  const out: Polygon = [];
  for (let i = 0; i < ring.length; i++) {
    const before = ring[(i - 1 + ring.length) % ring.length];
    const corner = ring[i];
    const after = ring[(i + 1) % ring.length];
    const arc = cornerArc(before, corner, after, ccw, radiusAt);
    if (arc === null) out.push([snap(corner[0]), snap(corner[1])]);
    else for (const p of arc) out.push([snap(p[0]), snap(p[1])]);
  }
  return out;
}

/** Arc replacing one corner, or null when the corner stays sharp. */
function cornerArc(a: Vec2, b: Vec2, c: Vec2, ccw: boolean, radiusAt: () => number): Vec2[] | null {
  const la = dist(a, b);
  const lc = dist(b, c);
  if (la < 1e-6 || lc < 1e-6) return null;
  const u: Vec2 = [(a[0] - b[0]) / la, (a[1] - b[1]) / la];
  const w: Vec2 = [(c[0] - b[0]) / lc, (c[1] - b[1]) / lc];
  const turnsLeft = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) > 0;
  if (turnsLeft !== ccw) return null; // concave corner: no curb return
  const interior = Math.acos(Math.min(1, Math.max(-1, u[0] * w[0] + u[1] * w[1])));
  if (Math.PI - interior < MIN_TURN) return null;
  const half = interior / 2;
  const tangent = Math.min(radiusAt() / Math.tan(half), MAX_EDGE_SHARE * Math.min(la, lc));
  const radius = tangent * Math.tan(half);
  if (radius < MIN_RADIUS) return null;

  const bisector = normalize([u[0] + w[0], u[1] + w[1]]);
  if (bisector === null) return null;
  const center: Vec2 = [
    b[0] + bisector[0] * (radius / Math.sin(half)),
    b[1] + bisector[1] * (radius / Math.sin(half)),
  ];
  const start: Vec2 = [b[0] + u[0] * tangent, b[1] + u[1] * tangent];
  const end: Vec2 = [b[0] + w[0] * tangent, b[1] + w[1] * tangent];
  const from = Math.atan2(start[1] - center[1], start[0] - center[0]);
  let sweep = Math.atan2(end[1] - center[1], end[0] - center[0]) - from;
  while (sweep <= -Math.PI) sweep += 2 * Math.PI;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;

  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / ARC_STEP));
  const points: Vec2[] = [];
  for (let s = 0; s <= steps; s++) {
    const angle = from + (sweep * s) / steps;
    points.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius]);
  }
  return points;
}

function normalize(v: Vec2): Vec2 | null {
  const l = Math.hypot(v[0], v[1]);
  return l < 1e-9 ? null : [v[0] / l, v[1] / l];
}
