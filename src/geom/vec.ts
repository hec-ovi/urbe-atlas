import type { Vec2 } from '../../schema/blueprint';

export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const scale = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];
export const len = (a: Vec2): number => Math.hypot(a[0], a[1]);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const distSq = (a: Vec2, b: Vec2): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const perp = (a: Vec2): Vec2 => [-a[1], a[0]];
export const neg = (a: Vec2): Vec2 => [-a[0], -a[1]];

export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  return l < 1e-12 ? [0, 0] : [a[0] / l, a[1] / l];
}

export const angleOf = (a: Vec2): number => Math.atan2(a[1], a[0]);
export const fromAngle = (t: number): Vec2 => [Math.cos(t), Math.sin(t)];

/** Closest point on segment ab to p, plus its parameter t in [0,1]. */
export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return { point: a, t: 0 };
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return { point: add(a, scale(ab, t)), t };
}

/**
 * Intersection of segments p1-p2 and p3-p4, or null.
 * Returns parameters along each segment; endpoints included within eps.
 */
export function segmentIntersection(
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  p4: Vec2,
  eps = 1e-9,
): { point: Vec2; t: number; u: number } | null {
  const d1 = sub(p2, p1);
  const d2 = sub(p4, p3);
  const denom = cross(d1, d2);
  if (Math.abs(denom) < 1e-12) return null;
  const dp = sub(p3, p1);
  const t = cross(dp, d2) / denom;
  const u = cross(dp, d1) / denom;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { point: add(p1, scale(d1, Math.max(0, Math.min(1, t)))), t, u };
}
