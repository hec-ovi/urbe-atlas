/**
 * Core feasibility, constants mirrored from the published feasibility of
 * interior (elevator and walkup stair cores). An envelope above 6 floors
 * needs the elevator core; every buildable parcel needs at least the
 * walkup core. The fit test is sufficient-only (a handful of exact
 * candidate placements): it never certifies a footprint the core cannot
 * fit; a pathological shape may get rejected although some exotic
 * placement exists.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import { intersection, offset } from '../geom/clip';
import { area } from '../geom/polygon';
import { orientedBoundingBox } from '../geom/obb';

/**
 * Elevator core, from interior core-feasibility v0.5: compact core row
 * (2.5 + 2.5 stair columns + 2.5 car + 1.2 riser + 1.2 stub + 0.5 margin)
 * by a 2.5 corridor plus working strips.
 */
export const CORE_WIDTH = 10.4;
export const CORE_DEPTH = 8.0;

/**
 * Walkup core, same source: minWalkupCoreLength 7.9 by its working depth 5.5.
 * Below it nothing downstream can build, so the lot is not a parcel.
 */
export const WALKUP_CORE_WIDTH = 7.9;
export const WALKUP_CORE_DEPTH = 5.5;

/** Floor cap when the elevator core does not fit. */
export const NO_CORE_MAX_FLOORS = 6;

/** Elevator/stair core for envelopes above NO_CORE_MAX_FLOORS floors. */
export function fitsCore(footprint: Polygon): boolean {
  return fitsRect(footprint, CORE_WIDTH, CORE_DEPTH);
}

/** Walkup stair core every buildable parcel must host. */
export function fitsWalkupCore(footprint: Polygon): boolean {
  return fitsRect(footprint, WALKUP_CORE_WIDTH, WALKUP_CORE_DEPTH);
}

function fitsRect(footprint: Polygon, width: number, depth: number): boolean {
  const eroded = offset([footprint], -depth / 2);
  for (const piece of eroded) {
    const obb = orientedBoundingBox(piece);
    if (obb.length < width - depth) continue;
    const shift = Math.max(0, (obb.length - (width - depth)) / 2);
    const centers: Vec2[] = [
      obb.center,
      [obb.center[0] + obb.axis[0] * shift * 0.5, obb.center[1] + obb.axis[1] * shift * 0.5],
      [obb.center[0] - obb.axis[0] * shift * 0.5, obb.center[1] - obb.axis[1] * shift * 0.5],
    ];
    for (const c of centers) {
      if (rectangleInside(footprint, c, obb.axis, width, depth)) return true;
    }
  }
  return false;
}

function rectangleInside(footprint: Polygon, center: Vec2, axis: Vec2, width: number, depth: number): boolean {
  const u: Vec2 = axis;
  const v: Vec2 = [-axis[1], axis[0]];
  const hw = width / 2;
  const hd = depth / 2;
  const rect: Polygon = [
    [center[0] - u[0] * hw - v[0] * hd, center[1] - u[1] * hw - v[1] * hd],
    [center[0] + u[0] * hw - v[0] * hd, center[1] + u[1] * hw - v[1] * hd],
    [center[0] + u[0] * hw + v[0] * hd, center[1] + u[1] * hw + v[1] * hd],
    [center[0] - u[0] * hw + v[0] * hd, center[1] - u[1] * hw + v[1] * hd],
  ];
  const inside = intersection([footprint], [rect]);
  let covered = 0;
  for (const p of inside) covered += area(p);
  return covered >= width * depth - 0.05;
}
