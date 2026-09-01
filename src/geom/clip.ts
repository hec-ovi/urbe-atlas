/**
 * Fixed-point wrapper around clipper2-ts: the single geometry kernel.
 * All coords snap to a 1 mm integer grid before any boolean/offset,
 * which is what keeps seed -> output byte-identical.
 */
import {
  EndType,
  FillRule,
  JoinType,
  area as clipArea,
  difference as clipDifference,
  intersect as clipIntersect,
  inflatePaths,
  union as clipUnion,
} from 'clipper2-ts';
import type { Polygon, Vec2 } from '../../schema/blueprint';
import { ensureCCW, area } from './polygon';

const SCALE = 1000; // 1 unit = 1 mm

type IntPoint = { x: number; y: number };
type IntPath = IntPoint[];

export const snap = (v: number): number => Math.round(v * SCALE) / SCALE;
export const snapPoint = (p: Vec2): Vec2 => [snap(p[0]), snap(p[1])];

function toPath(poly: Polygon): IntPath {
  return poly.map(([x, z]) => ({ x: Math.round(x * SCALE), y: Math.round(z * SCALE) }));
}

function fromPath(path: IntPath): Polygon {
  return path.map((p) => [p.x / SCALE, p.y / SCALE]);
}

/**
 * Clipper marks holes by opposite winding. The schema's Polygon is a simple
 * ring, so regions with holes get split by a line through each hole until
 * every piece is simply connected.
 */
function fromPaths(paths: IntPath[], minArea = 1e-6, depth = 0): Polygon[] {
  const outers: IntPath[] = [];
  const holes: IntPath[] = [];
  for (const path of paths) {
    if (path.length < 3) continue;
    const a = clipArea(path);
    if (a > 0) outers.push(path);
    else if (a < 0) holes.push(path);
  }
  if (holes.length === 0 || depth >= 12) {
    const out: Polygon[] = [];
    for (const path of outers) {
      const poly = ensureCCW(fromPath(path));
      if (area(poly) >= minArea) out.push(poly);
    }
    return out;
  }
  // split the whole region vertically through the interior of the biggest hole
  let biggest = holes[0];
  for (const h of holes) if (Math.abs(clipArea(h)) > Math.abs(clipArea(biggest))) biggest = h;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of biggest) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }
  const cutX = Math.round((minX + maxX) / 2);
  let loX = Infinity;
  let hiX = -Infinity;
  let loY = Infinity;
  let hiY = -Infinity;
  for (const path of paths) {
    for (const p of path) {
      if (p.x < loX) loX = p.x;
      if (p.x > hiX) hiX = p.x;
      if (p.y < loY) loY = p.y;
      if (p.y > hiY) hiY = p.y;
    }
  }
  const pad = 1000;
  const left: IntPath = [
    { x: loX - pad, y: loY - pad },
    { x: cutX, y: loY - pad },
    { x: cutX, y: hiY + pad },
    { x: loX - pad, y: hiY + pad },
  ];
  const right: IntPath = [
    { x: cutX, y: loY - pad },
    { x: hiX + pad, y: loY - pad },
    { x: hiX + pad, y: hiY + pad },
    { x: cutX, y: hiY + pad },
  ];
  return [
    ...fromPaths(clipIntersect(paths, [left], FillRule.NonZero), minArea, depth + 1),
    ...fromPaths(clipIntersect(paths, [right], FillRule.NonZero), minArea, depth + 1),
  ];
}

/** Positive delta grows, negative shrinks. May return zero, one or many polygons. */
export function offset(polys: Polygon[], delta: number, miterLimit = 2): Polygon[] {
  if (polys.length === 0) return [];
  const paths = inflatePaths(polys.map(toPath), delta * SCALE, JoinType.Miter, EndType.Polygon, miterLimit);
  return fromPaths(paths);
}

/** Buffer an open polyline into a polygon of the given total width. */
export function bufferLine(line: Vec2[], width: number): Polygon[] {
  if (line.length < 2) return [];
  const paths = inflatePaths([toPath(line)], (width / 2) * SCALE, JoinType.Round, EndType.Round, 2, 50);
  return fromPaths(paths);
}

export function union(polys: Polygon[]): Polygon[] {
  if (polys.length === 0) return [];
  const paths = clipUnion(polys.map(toPath), [], FillRule.NonZero);
  return fromPaths(paths);
}

export function difference(subject: Polygon[], clip: Polygon[]): Polygon[] {
  if (subject.length === 0) return [];
  if (clip.length === 0) return subject.map(ensureCCW);
  const paths = clipDifference(subject.map(toPath), clip.map(toPath), FillRule.NonZero);
  return fromPaths(paths);
}

export function intersection(subject: Polygon[], clip: Polygon[]): Polygon[] {
  if (subject.length === 0 || clip.length === 0) return [];
  const paths = clipIntersect(subject.map(toPath), clip.map(toPath), FillRule.NonZero);
  return fromPaths(paths);
}
