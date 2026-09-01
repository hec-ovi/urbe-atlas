/**
 * Footprint band: the width a polygon keeps between its two long sides,
 * read across a frame axis along its whole length. Edges within 45 degrees
 * of the axis are sides, steeper edges are ends, and a chord that meets an
 * end edge is an oblique cap rather than a narrowing. Frames run along the
 * longest edges, the OBB axis and their normals; a frame counts only when
 * its side edges outweigh its end edges, so a sliver never reads its length
 * as its width. The band of a polygon is the best band any frame reads.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import { intersection } from './clip';
import { orientedBoundingBox } from './obb';
import { area } from './polygon';

const SIDE_COS = Math.SQRT1_2;
/** Chords are read this far inside each vertex level, meters. */
const EPS = 1e-4;
/** Edges shorter than this never define a frame, meters. */
const MIN_FRAME_EDGE = 3;
/** Frames closer than one degree are the same frame. */
const SAME_AXIS = Math.cos(Math.PI / 180);
const TOLERANCE = 1e-9;

/** Polygon in a frame: points as [u, v], whether each edge i (to i+1) is a side, and its chord readings once read. */
interface Framed {
  axis: Vec2;
  pts: Vec2[];
  side: boolean[];
  readings: Reading[] | null;
}

/** One reading of the body chord at u = t; null where every chord meets an end edge. */
interface Reading {
  t: number;
  width: number | null;
}

/** Widest band the polygon hosts end to end in any valid frame, meters. */
export function bandWidth(poly: Polygon): number {
  let best = 0;
  for (const f of frames(poly)) best = Math.max(best, bandIn(f));
  return best;
}

/** True when some valid frame reads a band of at least `width`. */
export function hostsBand(poly: Polygon, width: number): boolean {
  for (const f of frames(poly)) if (bandIn(f) >= width - TOLERANCE) return true;
  return false;
}

/**
 * The polygon cut down to the run that hosts `width` end to end: the polygon
 * itself when it already does, its largest hosting slab otherwise, null when
 * no frame yields one.
 */
export function trimToBand(poly: Polygon, width: number): Polygon | null {
  const fs = frames(poly);
  if (fs.some((f) => bandIn(f) >= width - TOLERANCE)) return poly;
  for (const f of fs) {
    const run = longestGoodRun(f, width);
    if (!run) continue;
    const piece = largest(intersection([poly], [slab(f, run)]));
    if (piece && hostsBand(piece, width)) return piece;
  }
  return null;
}

function frames(poly: Polygon): Framed[] {
  const n = poly.length;
  const edges = poly
    .map((a, i) => {
      const b = poly[(i + 1) % n];
      return { axis: [b[0] - a[0], b[1] - a[1]] as Vec2, length: Math.hypot(b[0] - a[0], b[1] - a[1]) };
    })
    .filter((e) => e.length >= MIN_FRAME_EDGE)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)
    .map((e): Vec2 => [e.axis[0] / e.length, e.axis[1] / e.length]);
  const axes: Vec2[] = [...edges, orientedBoundingBox(poly).axis];
  for (const a of [...axes]) axes.push([-a[1], a[0]]);
  const distinct: Vec2[] = [];
  for (const a of axes) {
    if (!distinct.some((d) => Math.abs(d[0] * a[0] + d[1] * a[1]) >= SAME_AXIS)) distinct.push(a);
  }
  const out: Framed[] = [];
  for (const axis of distinct) {
    const f = frame(poly, axis);
    if (f) out.push(f);
  }
  return out;
}

/** The polygon seen along `axis`; null when its end edges outweigh its side edges. */
function frame(poly: Polygon, axis: Vec2): Framed | null {
  const pts = poly.map((p): Vec2 => [p[0] * axis[0] + p[1] * axis[1], -p[0] * axis[1] + p[1] * axis[0]]);
  let sides = 0;
  let ends = 0;
  const side = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const isSide = l > 0 && Math.abs(b[0] - a[0]) / l >= SIDE_COS;
    if (isSide) sides += l;
    else ends += l;
    return isSide;
  });
  return sides >= ends ? { axis, pts, side, readings: null } : null;
}

/** Narrowest body chord along the frame; 0 when no chord runs between two sides. */
function bandIn(f: Framed): number {
  let band = Infinity;
  for (const r of readingsOf(f)) if (r.width !== null && r.width < band) band = r.width;
  return band === Infinity ? 0 : band;
}

/** Body chord at u = t: the narrowest interval bounded by side edges at both ends. */
function bodyChord(f: Framed, t: number): number | null {
  const n = f.pts.length;
  const hits: { v: number; side: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const a = f.pts[i];
    const b = f.pts[(i + 1) % n];
    if (a[0] <= t === b[0] <= t) continue;
    hits.push({ v: a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]), side: f.side[i] });
  }
  hits.sort((p, q) => p.v - q.v);
  let width: number | null = null;
  for (let k = 0; k + 1 < hits.length; k += 2) {
    if (!hits[k].side || !hits[k + 1].side) continue;
    const w = hits[k + 1].v - hits[k].v;
    if (width === null || w < width) width = w;
  }
  return width;
}

/** Chord readings just inside both ends of every span between vertex levels, in u order, read once per frame. */
function readingsOf(f: Framed): Reading[] {
  if (f.readings) return f.readings;
  const levels = [...new Set(f.pts.map((p) => p[0]))].sort((a, b) => a - b);
  const out: Reading[] = [];
  for (let i = 0; i + 1 < levels.length; i++) {
    const lo = levels[i] + EPS;
    const hi = levels[i + 1] - EPS;
    if (hi <= lo) continue;
    out.push({ t: lo, width: bodyChord(f, lo) }, { t: hi, width: bodyChord(f, hi) });
  }
  f.readings = out;
  return out;
}

/**
 * Longest u-run where every body chord reaches `width` (cap spans count as
 * good). Chords vary linearly between readings, so a crossing is interpolated.
 */
function longestGoodRun(f: Framed, width: number): [number, number] | null {
  const rs = readingsOf(f);
  if (rs.length === 0) return null;
  const good = (w: number | null): boolean => w === null || w >= width - TOLERANCE;
  const runs: [number, number][] = [];
  let open = false;
  for (let i = 0; i + 1 < rs.length; i += 2) {
    const lo = rs[i];
    const hi = rs[i + 1];
    const goodLo = good(lo.width);
    const goodHi = good(hi.width);
    if (!goodLo && !goodHi) {
      open = false;
      continue;
    }
    let from = lo.t;
    let to = hi.t;
    if (lo.width !== null && hi.width !== null) {
      const slope = (hi.width - lo.width) / (hi.t - lo.t);
      if (!goodLo) from = lo.t + (width - lo.width) / slope;
      if (!goodHi) to = lo.t + (width - lo.width) / slope;
    }
    const last = runs[runs.length - 1];
    if (open && goodLo && from - last[1] <= 2 * EPS + TOLERANCE) last[1] = to;
    else runs.push([from, to]);
    open = goodHi;
  }
  let best: [number, number] | null = null;
  for (const r of runs) if (!best || r[1] - r[0] > best[1] - best[0]) best = r;
  if (!best) return null;
  // a run reaching the polygon's end keeps that end uncut
  const first = rs[0].t;
  const final = rs[rs.length - 1].t;
  return [best[0] <= first + TOLERANCE ? first - 1 : best[0], best[1] >= final - TOLERANCE ? final + 1 : best[1]];
}

/** World-space rectangle covering the frame's v range over the u run. */
function slab(f: Framed, run: [number, number]): Polygon {
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const p of f.pts) {
    vMin = Math.min(vMin, p[1]);
    vMax = Math.max(vMax, p[1]);
  }
  const [ux, uz] = f.axis;
  const toWorld = (u: number, v: number): Vec2 => [u * ux - v * uz, u * uz + v * ux];
  return [toWorld(run[0], vMin - 1), toWorld(run[1], vMin - 1), toWorld(run[1], vMax + 1), toWorld(run[0], vMax + 1)];
}

function largest(pieces: Polygon[]): Polygon | null {
  let best: Polygon | null = null;
  let bestArea = 0;
  for (const p of pieces) {
    const a = area(p);
    if (a > bestArea) {
      bestArea = a;
      best = p;
    }
  }
  return best;
}
