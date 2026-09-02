/**
 * Street furniture along the sidewalks: trees, light poles and bins, standing
 * in the furnishing strip beside the kerb so the walking line stays clear
 * (NACTO zones). Dense districts plant closer. A point is dropped where it
 * would stand on a crossing, a bus stop, a station entrance or the way into a
 * building. Seeded and deterministic, like everything else here.
 */
import type { PlantingKind, PlantingPoint, StreetEdge, Vec2 } from '../../schema/blueprint';
import type { DistrictKind } from '../../schema/params';
import type { Rng } from '../core/rng';
import { length as lineLength, directionAt, distanceTo, pointAt } from '../geom/polyline';
import { CURB_WIDTH } from './widths';

/** Spacing along a sidewalk, meters: dense centers plant closer. */
export const PLANTING_SPACING = { dense: 8, rest: 12 } as const;
/** How far a point stays from a crossing, a stop, a station entrance or a parcel access. */
export const PLANTING_CLEARANCE = 6;
/** Widest furnishing strip taken off the sidewalk, and the share of a narrow one. */
const STRIP_MAX = 0.6;
const STRIP_SHARE = 0.4;
/** Nothing stands within this of a junction. */
const END_MARGIN = 4;
/** How far a verified point may read off its own band, meters: the 1 mm grid and a bend. */
const BAND_SLACK = 0.5;
/** A light pole every this many points; the rest are trees, minus the odd bin. */
const POLE_EVERY = 3;
const BIN_CHANCE = 0.08;

/** Everything a planting point keeps clear of. */
export class Obstacles {
  private readonly cells = new Map<string, Vec2[]>();

  add(points: readonly Vec2[]): void {
    for (const p of points) {
      const key = this.key(p);
      const cell = this.cells.get(key);
      if (cell) cell.push(p);
      else this.cells.set(key, [p]);
    }
  }

  blocks(p: Vec2): boolean {
    const gx = Math.floor(p[0] / PLANTING_CLEARANCE);
    const gz = Math.floor(p[1] / PLANTING_CLEARANCE);
    for (let x = gx - 1; x <= gx + 1; x++) {
      for (let z = gz - 1; z <= gz + 1; z++) {
        for (const q of this.cells.get(`${x},${z}`) ?? []) {
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) < PLANTING_CLEARANCE) return true;
        }
      }
    }
    return false;
  }

  private key(p: Vec2): string {
    return `${Math.floor(p[0] / PLANTING_CLEARANCE)},${Math.floor(p[1] / PLANTING_CLEARANCE)}`;
  }
}

export class Planting {
  static build(
    edges: readonly StreetEdge[],
    districtKindOf: (edgeId: string) => DistrictKind,
    obstacles: Obstacles,
    rng: Rng,
  ): PlantingPoint[] {
    const out: PlantingPoint[] = [];
    for (const edge of edges) {
      // an alley is a pedestrian cut with no kerb, a highway a deck with no sidewalk
      if (edge.class === 'alley' || edge.class === 'highway') continue;
      const kind = districtKindOf(edge.id);
      const spacing = kind === 'downtown' || kind === 'commercial' ? PLANTING_SPACING.dense : PLANTING_SPACING.rest;
      const armLength = lineLength(edge.path);
      if (armLength <= END_MARGIN * 2) continue;
      for (const side of [1, -1] as const) {
        const sidewalk = side > 0 ? edge.sidewalk.left : edge.sidewalk.right;
        if (sidewalk <= CURB_WIDTH) continue;
        const strip = Math.min(STRIP_MAX, sidewalk * STRIP_SHARE);
        const reach = edge.width / 2 + CURB_WIDTH + strip / 2;
        const sideRng = rng.fork(`${edge.id}:${side}`);
        const poleAt = sideRng.int(0, POLE_EVERY - 1);
        let index = 0;
        for (let arc = END_MARGIN; arc <= armLength - END_MARGIN; arc += spacing, index++) {
          const along = directionAt(edge.path, arc);
          const left: Vec2 = [-along[1], along[0]];
          const base = pointAt(edge.path, arc);
          const position: Vec2 = [base[0] + left[0] * reach * side, base[1] + left[1] * reach * side];
          const furniture: PlantingKind = index % POLE_EVERY === poleAt ? 'pole' : sideRng.chance(BIN_CHANCE) ? 'bin' : 'tree';
          if (obstacles.blocks(position)) continue;
          // a tight bend pinches the offset line back toward the roadway: verify every point on its own edge
          const off = distanceTo(edge.path, position);
          if (off < edge.width / 2 - BAND_SLACK || off > edge.width / 2 + sidewalk + BAND_SLACK) continue;
          out.push({ position, edgeId: edge.id, kind: furniture, spacing });
        }
      }
    }
    return out;
  }
}
