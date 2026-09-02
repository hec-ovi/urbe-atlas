/**
 * Core hosting, derived from interior's published core feasibility
 * (../interior/schemas/core-feasibility.json; the constants read here are
 * mirrored in INTERIOR and a test fails when that file moves). A hosting
 * rectangle is a core mode's band length by its plate depth, grown on both
 * axes by one snap (the corridor face and the core start land on interior's
 * 0.5 m grid, so an exact fit can miss it) and by twice the deepest facade,
 * so the core fits behind the shell wall and its lining. The stair shaft is
 * sized for the longest flight the recipe allows, which holds whatever floor
 * heights exterior picks. The fit test is sufficient-only (a handful of exact
 * candidate placements): it never certifies a footprint the core cannot fit;
 * a pathological shape may get rejected although some exotic placement exists.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import { intersection, offset } from '../geom/clip';
import { area } from '../geom/polygon';
import { orientedBoundingBox } from '../geom/obb';

/** Interior core-feasibility constants this box reads; facadeDepth is the deepest entry of its facade table. Meters. */
export const INTERIOR = {
  snap: 0.5,
  corridorWidth: 2.5,
  elevatorShaft: 2.5,
  riserShaft: 1.2,
  serviceStub: 1.2,
  margin: 0.5,
  minStripDepth: 3.0,
  stairColumnWidth: 2.5,
  stairTread: 0.28,
  stairLanding: 1.2,
  maxRisersPerFlight: 14,
  walkupMaxFloors: 6,
  twoStairsAreaOver: 460,
  twoStairsFloorsOver: 4,
  facadeDepth: 0.62,
};

/** Deepest stair shaft the recipe sizes: the longest flight allowed plus two landings, snapped up. */
const STAIR_SHAFT = Math.ceil((INTERIOR.maxRisersPerFlight * INTERIOR.stairTread + 2 * INTERIOR.stairLanding) / INTERIOR.snap) * INTERIOR.snap;
const WALKUP_LENGTH = STAIR_SHAFT + INTERIOR.riserShaft + INTERIOR.serviceStub + INTERIOR.margin;
const WALKUP_TWO_STAIRS_LENGTH = WALKUP_LENGTH + STAIR_SHAFT;
const STANDARD_LENGTH = WALKUP_TWO_STAIRS_LENGTH + INTERIOR.elevatorShaft;
const COMPACT_LENGTH = 2 * INTERIOR.stairColumnWidth + INTERIOR.riserShaft + INTERIOR.serviceStub + INTERIOR.margin + INTERIOR.elevatorShaft;
const CROSS_DEPTH = INTERIOR.elevatorShaft + INTERIOR.corridorWidth + INTERIOR.minStripDepth;
const COMPACT_DEPTH = INTERIOR.minStripDepth + INTERIOR.corridorWidth + STAIR_SHAFT;

/** A hosting rectangle: length along the core band by depth across it, meters. */
export type Rect = readonly [number, number];

function hosting(length: number, depth: number): Rect {
  const grow = INTERIOR.snap + 2 * INTERIOR.facadeDepth;
  const round = (x: number): number => Math.round((x + grow) * 100) / 100;
  return [round(length), round(depth)];
}

/** Walkup with one stair: every light footprint hosts it. */
export const WALKUP_RECT = hosting(WALKUP_LENGTH, CROSS_DEPTH);
/** Walkup with two stairs: floors up to walkupMaxFloors, and any footprint over twoStairsAreaOver. */
export const WALKUP_TWO_STAIRS_RECT = hosting(WALKUP_TWO_STAIRS_LENGTH, CROSS_DEPTH);
/** Compact elevator core: every heavy footprint hosts it. */
export const COMPACT_RECT = hosting(COMPACT_LENGTH, COMPACT_DEPTH);
/** Standard elevator core. */
export const STANDARD_RECT = hosting(STANDARD_LENGTH, CROSS_DEPTH);

export interface CoreFit {
  /** Floors the best hosted core allows: Infinity with an elevator core, 0 when no core fits. */
  floorCap: number;
  /** The compact elevator core fits, which a heavy type needs. */
  compact: boolean;
}

/** Best core the footprint hosts. */
export function coreFit(footprint: Polygon): CoreFit {
  const compact = fitsRect(footprint, COMPACT_RECT);
  if (compact || fitsRect(footprint, STANDARD_RECT)) return { floorCap: Infinity, compact };
  if (fitsRect(footprint, WALKUP_TWO_STAIRS_RECT)) return { floorCap: INTERIOR.walkupMaxFloors, compact: false };
  const oneStair = area(footprint) <= INTERIOR.twoStairsAreaOver && fitsRect(footprint, WALKUP_RECT);
  return { floorCap: oneStair ? INTERIOR.twoStairsFloorsOver : 0, compact: false };
}

/** The rectangle fits somewhere inside the footprint, in either orientation. */
export function fitsRect(footprint: Polygon, rect: Rect): boolean {
  return fitsOriented(footprint, rect[0], rect[1]) || fitsOriented(footprint, rect[1], rect[0]);
}

/** `width` along the footprint's long axis by `depth` across it. */
function fitsOriented(footprint: Polygon, width: number, depth: number): boolean {
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
