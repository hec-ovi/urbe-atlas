/** Sparse sidewalk tree groups and separately spaced lighting. */
import type { PlantingKind, PlantingPoint, StreetEdge, Vec2 } from '../../schema/blueprint';
import type { DistrictKind } from '../../schema/params';
import type { Rng } from '../core/rng';
import { length as lineLength, directionAt, distanceTo, pointAt } from '../geom/polyline';
import { closestOnSegment, dist } from '../geom/vec';
import { sidewalkBand } from './construction/SidewalkSection';

/** Spacing along a sidewalk, meters: dense centers plant closer. */
export const PLANTING_SPACING = { dense: 8, rest: 12 } as const;
/** How far a point stays from a crossing, a stop, a station entrance or a parcel access. */
export const PLANTING_CLEARANCE = 6;
/** Nothing stands within this of a junction. */
const END_MARGIN = 4;
/** How far a verified point may read off its own band, meters: the 1 mm grid and a bend. */
const BAND_SLACK = 0.5;
/** Lighting keeps its own regular spacing. */
const POLE_EVERY = 3;
const BIN_CHANCE = 0.04;
const TREE_GROUP_CHANCE = 0.4;

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

  blocks(p: Vec2): boolean { return this.blocksLine(p, p); }

  blocksLine(a: Vec2, b: Vec2): boolean {
    const low = a.map((value, axis) => Math.floor((Math.min(value, b[axis]) - PLANTING_CLEARANCE) / PLANTING_CLEARANCE));
    const high = a.map((value, axis) => Math.floor((Math.max(value, b[axis]) + PLANTING_CLEARANCE) / PLANTING_CLEARANCE));
    for (let x = low[0]; x <= high[0]; x++) for (let z = low[1]; z <= high[1]; z++) {
      for (const point of this.cells.get(`${x},${z}`) ?? []) {
        if (dist(point, closestOnSegment(point, a, b).point) < PLANTING_CLEARANCE) return true;
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
        const band = sidewalkBand(edge, side > 0 ? 'left' : 'right', 'furnishing');
        if (band.width <= 0) continue;
        const reach = edge.width / 2 + band.offset;
        const sideRng = rng.fork(`${edge.id}:${side}`);
        const poleAt = sideRng.int(0, POLE_EVERY - 1);
        const stations = Math.floor((armLength - END_MARGIN * 2) / spacing) + 1;
        const treeRng = sideRng.fork('trees');
        const treeCount = treeRng.chance(TREE_GROUP_CHANCE) ? treeRng.int(1, Math.min(2, stations)) : 0;
        const treeStart = treeCount ? treeRng.int(0, stations - treeCount) : -1;
        let index = 0;
        for (let arc = END_MARGIN; arc <= armLength - END_MARGIN; arc += spacing, index++) {
          const along = directionAt(edge.path, arc);
          const left: Vec2 = [-along[1], along[0]];
          const base = pointAt(edge.path, arc);
          const position: Vec2 = [base[0] + left[0] * reach * side, base[1] + left[1] * reach * side];
          const furniture: PlantingKind | undefined = index % POLE_EVERY === poleAt ? 'pole'
            : index >= treeStart && index < treeStart + treeCount ? 'tree'
              : sideRng.chance(BIN_CHANCE) ? 'bin' : undefined;
          if (!furniture) continue;
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
