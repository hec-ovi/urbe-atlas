/**
 * Irregular city outline: harmonic radial noise for curved edges,
 * half-plane cuts for straight angled edges, circle unions for round bulges.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import type { Rng } from '../core/rng';
import { difference, snapPoint, union } from '../geom/clip';
import { area, ensureCCW } from '../geom/polygon';
import { simplify } from '../geom/polyline';
import { unsatisfiable } from '../errors';

export class CityBoundary {
  static generate(rng: Rng, size: { width: number; depth: number }, irregularity: number): Polygon {
    const cx = size.width / 2;
    const cz = size.depth / 2;
    const rx = size.width * 0.46;
    const rz = size.depth * 0.46;

    const harmonics = [
      { freq: rng.int(2, 3), phase: rng.range(0, Math.PI * 2), amp: 0.2 },
      { freq: rng.int(4, 5), phase: rng.range(0, Math.PI * 2), amp: 0.1 },
      { freq: rng.int(6, 9), phase: rng.range(0, Math.PI * 2), amp: 0.05 },
    ];

    const n = 128;
    const base: Polygon = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      let f = 1;
      for (const h of harmonics) f -= irregularity * h.amp * (0.5 + 0.5 * Math.sin(h.freq * t + h.phase));
      base.push(snapPoint([cx + rx * f * Math.cos(t), cz + rz * f * Math.sin(t)]));
    }

    let polys: Polygon[] = [base];

    const bulges = Math.round(irregularity * 2);
    for (let i = 0; i < bulges; i++) {
      const t = rng.range(0, Math.PI * 2);
      const r = rng.range(0.15, 0.28) * Math.min(rx, rz);
      const bc: Vec2 = [cx + rx * 0.85 * Math.cos(t), cz + rz * 0.85 * Math.sin(t)];
      polys = union([...polys, circle(bc, r)]);
    }

    const cuts = irregularity > 0 ? 1 + Math.round(irregularity * 2) : 0;
    for (let i = 0; i < cuts; i++) {
      const t = rng.range(0, Math.PI * 2);
      const d = rng.range(0.62, 0.88) * Math.min(rx, rz);
      polys = difference(polys, [halfPlane([cx, cz], t, d, Math.max(rx, rz) * 4)]);
    }

    polys.sort((a, b) => area(b) - area(a));
    const outline = polys[0];
    if (!outline || area(outline) < size.width * size.depth * 0.15) {
      throw unsatisfiable('boundary generation collapsed; enlarge size or lower irregularity');
    }
    return ensureCCW(simplify(outline, 2).map(snapPoint));
  }
}

function circle(center: Vec2, radius: number, segments = 40): Polygon {
  const out: Polygon = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    out.push(snapPoint([center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)]));
  }
  return out;
}

/** Rectangle covering everything beyond distance d from center along direction t. */
function halfPlane(center: Vec2, t: number, d: number, extent: number): Polygon {
  const dir: Vec2 = [Math.cos(t), Math.sin(t)];
  const side: Vec2 = [-dir[1], dir[0]];
  const p0: Vec2 = [center[0] + dir[0] * d, center[1] + dir[1] * d];
  const corner = (sx: number, fx: number): Vec2 =>
    snapPoint([p0[0] + side[0] * sx * extent + dir[0] * fx * extent, p0[1] + side[1] * sx * extent + dir[1] * fx * extent]);
  return [corner(-1, 0), corner(1, 0), corner(1, 1), corner(-1, 1)];
}
