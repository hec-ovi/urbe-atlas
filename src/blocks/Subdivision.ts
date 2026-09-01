/**
 * Recursive OBB lot subdivision (CityEngine-style): split perpendicular to
 * the long axis with jitter until lots reach target size; pieces that lose
 * street frontage trigger an orthogonal re-split, and interior leftovers
 * become open areas (courtyards) instead of parcels.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import type { Rng } from '../core/rng';
import { intersection } from '../geom/clip';
import { area } from '../geom/polygon';
import { orientedBoundingBox } from '../geom/obb';
import { closestOnSegment, dist } from '../geom/vec';

export interface SubdivisionConfig {
  minLotArea: number;
  maxLotArea: number;
  /** Some lots stay double-size for variety. */
  chanceNoDivide: number;
}

export interface SubdivisionResult {
  lots: Polygon[];
  openAreas: Polygon[];
}

const FRONTAGE_EPS = 0.9;

export class Subdivision {
  /**
   * blockOutline is the sidewalk-facing boundary used for frontage checks:
   * a lot has frontage when one of its vertices touches it.
   */
  static subdivide(poly: Polygon, blockOutline: Polygon, cfg: SubdivisionConfig, rng: Rng): SubdivisionResult {
    const lots: Polygon[] = [];
    const openAreas: Polygon[] = [];
    const stack: Polygon[] = [poly];
    let guard = 0;
    while (stack.length > 0 && guard++ < 5000) {
      const piece = stack.pop()!;
      const a = area(piece);
      if (a < cfg.minLotArea * 0.35) {
        openAreas.push(piece);
        continue;
      }
      const keepBig = a <= cfg.maxLotArea * 2 && rng.chance(cfg.chanceNoDivide);
      if (a <= cfg.maxLotArea || keepBig) {
        if (hasFrontage(piece, blockOutline)) lots.push(piece);
        else openAreas.push(piece);
        continue;
      }
      const halves = splitByOBB(piece, rng, false);
      if (halves.length < 2) {
        if (hasFrontage(piece, blockOutline)) lots.push(piece);
        else openAreas.push(piece);
        continue;
      }
      const anyLandlocked = halves.some((h) => area(h) >= cfg.minLotArea && !hasFrontage(h, blockOutline));
      const finalHalves = anyLandlocked ? splitByOBB(piece, rng, true) : halves;
      for (const h of finalHalves.length >= 2 ? finalHalves : halves) stack.push(h);
    }
    return { lots, openAreas };
  }
}

function splitByOBB(piece: Polygon, rng: Rng, orthogonal: boolean): Polygon[] {
  const obb = orientedBoundingBox(piece);
  if (obb.length < 1e-6) return [piece];
  const axis = orthogonal ? ([-obb.axis[1], obb.axis[0]] as Vec2) : obb.axis;
  const half = (orthogonal ? obb.width : obb.length) / 2;
  const t = rng.range(-0.15, 0.15) * half * 2;
  const extent = Math.max(obb.length, obb.width) * 2;
  const cutPoint: Vec2 = [obb.center[0] + axis[0] * t, obb.center[1] + axis[1] * t];
  const side: Vec2 = [-axis[1], axis[0]];
  const rect = (dir: 1 | -1): Polygon => {
    const c: Vec2 = [cutPoint[0] + dir * axis[0] * extent, cutPoint[1] + dir * axis[1] * extent];
    return [
      [cutPoint[0] - side[0] * extent, cutPoint[1] - side[1] * extent],
      [cutPoint[0] + side[0] * extent, cutPoint[1] + side[1] * extent],
      [c[0] + side[0] * extent, c[1] + side[1] * extent],
      [c[0] - side[0] * extent, c[1] - side[1] * extent],
    ];
  };
  const left = intersection([piece], [rect(1)]);
  const right = intersection([piece], [rect(-1)]);
  const out = [...left, ...right].filter((p) => area(p) > 1);
  return out.length >= 2 ? out : [piece];
}

function hasFrontage(piece: Polygon, outline: Polygon): boolean {
  for (const v of piece) {
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      const { point } = closestOnSegment(v, a, b);
      if (dist(v, point) < FRONTAGE_EPS) return true;
    }
  }
  return false;
}
