/**
 * Traces street streamlines through the tensor field with separation control.
 * All tiers share one sample set; per-tier dsep/dtest give the hierarchy.
 */
import type { Polyline, Vec2 } from '../../schema/blueprint';
import type { StreetClass } from '../../schema/blueprint';
import type { Rng } from '../core/rng';
import type { TensorField } from '../field/TensorField';
import { add, dist, dot, neg, scale, sub } from '../geom/vec';
import { pointInPolygon } from '../geom/polygon';
import type { Polygon } from '../../schema/blueprint';
import { SeparationGrid } from './SeparationGrid';
import { length as lineLength } from '../geom/polyline';

export interface TierParams {
  /** Separation between parallel streamlines of this tier. */
  dsep: number;
  /** Stop distance to any existing sample. */
  dtest: number;
  /** Integration step. */
  dstep: number;
  minLength: number;
  maxSteps: number;
}

export interface TracedLine {
  path: Polyline;
  class: StreetClass;
}

interface SeedCandidate {
  point: Vec2;
  family: 'major' | 'minor';
}

export class StreamlineTracer {
  private readonly field: TensorField;
  private readonly boundary: Polygon;
  /** Separation is per eigenvector family: crossing the other family is what makes intersections. */
  private readonly samples = { major: new SeparationGrid(30), minor: new SeparationGrid(30) };
  readonly lines: TracedLine[] = [];

  constructor(field: TensorField, boundary: Polygon) {
    this.field = field;
    this.boundary = boundary;
  }

  private inBounds(p: Vec2): boolean {
    return pointInPolygon(p, this.boundary);
  }

  private eigen(p: Vec2, family: 'major' | 'minor', prev: Vec2 | null): Vec2 {
    let v = family === 'major' ? this.field.major(p) : this.field.minor(p);
    if (v[0] === 0 && v[1] === 0) return v;
    if (prev && dot(v, prev) < 0) v = neg(v);
    return v;
  }

  /** One direction of a streamline from origin. Returns samples excluding origin. */
  private traceDirection(origin: Vec2, family: 'major' | 'minor', sign: 1 | -1, params: TierParams): Vec2[] {
    const out: Vec2[] = [];
    let p = origin;
    let prev: Vec2 | null = null;
    const own: Vec2[] = [origin];
    for (let i = 0; i < params.maxSteps; i++) {
      let v = this.eigen(p, family, prev);
      if (v[0] === 0 && v[1] === 0) break;
      if (prev === null && sign === -1) v = neg(v);
      const mid = this.eigen(add(p, scale(v, params.dstep / 2)), family, v);
      const step = mid[0] === 0 && mid[1] === 0 ? v : mid;
      const next = add(p, scale(step, params.dstep));
      if (!this.inBounds(next)) break;
      // self-collision: against own samples far enough behind
      let selfHit = false;
      for (let j = 0; j < own.length - 20; j++) {
        if (dist(own[j], next) < params.dtest) {
          selfHit = true;
          break;
        }
      }
      if (selfHit) break;
      // proximity to same-family lines: stop and join
      if (i * params.dstep > params.dtest * 2) {
        const near = this.samples[family].nearestWithin(next, params.dtest);
        if (near) {
          out.push(near);
          return out;
        }
      }
      out.push(next);
      own.push(next);
      prev = step;
      p = next;
    }
    // join a dangling end to any nearby line of either family
    if (out.length > 0) {
      const last = out[out.length - 1];
      const nearSame = this.samples[family].nearestWithin(last, params.dsep);
      const other: 'major' | 'minor' = family === 'major' ? 'minor' : 'major';
      const nearOther = this.samples[other].nearestWithin(last, params.dsep);
      const near =
        nearSame && nearOther
          ? dist(nearSame, last) <= dist(nearOther, last)
            ? nearSame
            : nearOther
          : (nearSame ?? nearOther);
      if (near && dist(near, last) > 1e-9) out.push(near);
    }
    return out;
  }

  /**
   * Trace one tier. Seeds are tried in order; each accepted line spawns
   * perpendicular seed candidates for tier coherence.
   */
  traceTier(cls: StreetClass, params: TierParams, seeds: readonly SeedCandidate[], rng: Rng): TracedLine[] {
    const queue: SeedCandidate[] = [...seeds];
    const accepted: TracedLine[] = [];
    let guard = 0;
    while (queue.length > 0 && guard < 200000) {
      guard++;
      const seed = queue.shift()!;
      if (!this.inBounds(seed.point)) continue;
      if (this.samples[seed.family].hasWithin(seed.point, params.dsep * 0.85)) continue;
      if (this.field.isDegenerate(seed.point)) continue;

      const forward = this.traceDirection(seed.point, seed.family, 1, params);
      const backward = this.traceDirection(seed.point, seed.family, -1, params);
      const path: Polyline = [...backward.reverse(), seed.point, ...forward];
      if (path.length < 3 || lineLength(path) < params.minLength) continue;

      accepted.push({ path, class: cls });
      this.lines.push({ path, class: cls });
      this.samples[seed.family].insertAll(path);

      // spawn candidates offset dsep to both sides, alternating family
      const other: 'major' | 'minor' = seed.family === 'major' ? 'minor' : 'major';
      const every = Math.max(1, Math.floor(params.dsep / params.dstep));
      for (let i = every; i < path.length - every; i += every) {
        queue.push({ point: path[i], family: other });
        const dir = this.eigen(path[i], seed.family, null);
        const side: Vec2 = [-dir[1], dir[0]];
        queue.push({ point: add(path[i], scale(side, params.dsep * rng.range(1.1, 1.4))), family: seed.family });
        queue.push({ point: add(path[i], scale(side, -params.dsep * rng.range(1.1, 1.4))), family: seed.family });
      }
    }
    return accepted;
  }

  /**
   * Seeds for the next, finer tier: points along accepted lines at `spacing`,
   * pushed sideways by `offset` (the finer tier's dsep) so they clear the
   * proximity rejection against the line they came from.
   */
  seedsFromLines(spacing: number, offset: number): SeedCandidate[] {
    const out: SeedCandidate[] = [];
    for (const line of this.lines) {
      let acc = 0;
      for (let i = 1; i < line.path.length; i++) {
        acc += dist(line.path[i - 1], line.path[i]);
        if (acc >= spacing) {
          acc = 0;
          const d = sub(line.path[i], line.path[i - 1]);
          const l = Math.hypot(d[0], d[1]);
          if (l < 1e-9) continue;
          const side: Vec2 = [-d[1] / l, d[0] / l];
          for (const s of [1, -1]) {
            const p = add(line.path[i], scale(side, s * offset));
            out.push({ point: p, family: 'major' });
            out.push({ point: p, family: 'minor' });
          }
        }
      }
    }
    return out;
  }
}
