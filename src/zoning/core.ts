/**
 * Core feasibility: an envelope above 6 floors needs an elevator/stair core,
 * so its footprint must contain a CORE_WIDTH x CORE_DEPTH rectangle.
 * Constants mirrored from interior's published core feasibility.
 * The test is sufficient-only (a handful of exact candidate placements):
 * it never certifies a footprint the core cannot fit; a pathological shape
 * may get capped although some exotic placement exists.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import { intersection, offset } from '../geom/clip';
import { area } from '../geom/polygon';
import { orientedBoundingBox } from '../geom/obb';

export const CORE_WIDTH = 10.4;
export const CORE_DEPTH = 8.0;

/** Floor cap when the core does not fit. */
export const NO_CORE_MAX_FLOORS = 6;

export function fitsCore(footprint: Polygon): boolean {
  const eroded = offset([footprint], -CORE_DEPTH / 2);
  for (const piece of eroded) {
    const obb = orientedBoundingBox(piece);
    if (obb.length < CORE_WIDTH - CORE_DEPTH) continue;
    const shift = Math.max(0, (obb.length - (CORE_WIDTH - CORE_DEPTH)) / 2);
    const centers: Vec2[] = [
      obb.center,
      [obb.center[0] + obb.axis[0] * shift * 0.5, obb.center[1] + obb.axis[1] * shift * 0.5],
      [obb.center[0] - obb.axis[0] * shift * 0.5, obb.center[1] - obb.axis[1] * shift * 0.5],
    ];
    for (const c of centers) {
      if (rectangleInside(footprint, c, obb.axis)) return true;
    }
  }
  return false;
}

function rectangleInside(footprint: Polygon, center: Vec2, axis: Vec2): boolean {
  const u: Vec2 = axis;
  const v: Vec2 = [-axis[1], axis[0]];
  const hw = CORE_WIDTH / 2;
  const hd = CORE_DEPTH / 2;
  const rect: Polygon = [
    [center[0] - u[0] * hw - v[0] * hd, center[1] - u[1] * hw - v[1] * hd],
    [center[0] + u[0] * hw - v[0] * hd, center[1] + u[1] * hw - v[1] * hd],
    [center[0] + u[0] * hw + v[0] * hd, center[1] + u[1] * hw + v[1] * hd],
    [center[0] - u[0] * hw + v[0] * hd, center[1] - u[1] * hw + v[1] * hd],
  ];
  const inside = intersection([footprint], [rect]);
  let covered = 0;
  for (const p of inside) covered += area(p);
  return covered >= CORE_WIDTH * CORE_DEPTH - 0.05;
}
