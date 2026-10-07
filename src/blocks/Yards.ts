/**
 * Yards: every piece of a block's buildable land that no lot covers, named for
 * what it is there for, so a consumer dresses it as a place and never leaves it
 * as bare ground.
 *
 * A block's open rectangles that share a side are one yard. Its kind follows
 * the land around it: a yard beside a subway entrance bay is the station's
 * forecourt, a yard no wider than a strip is planting, a yard on highway land
 * is a working yard, and the rest follow the zone, a garden behind homes, a
 * court behind shops and offices, a yard behind workshops. A yard lists the
 * streets it opens onto, the frontages of the block it reaches.
 */
import type { BlockYard, Polygon, YardKind } from '../../schema/blueprint';
import type { DistrictKind } from '../../schema/params';
import { area, bounds } from '../geom/polygon';

/** A yard narrower than this on every rectangle is a strip of planting. */
export const STRIP_WIDTH = 8;
const EPS = 1e-6;

const ZONE_KIND: Record<DistrictKind, YardKind> = {
  residential: 'garden',
  mixed: 'garden',
  downtown: 'court',
  commercial: 'court',
  industrial: 'yard',
};

export interface YardBlock {
  /** Open rectangles of the block, as published in `openAreas`. */
  open: readonly Polygon[];
  /** The buildable rectangle inside the block's sidewalk ring. */
  interior: Polygon;
  /** Street edges on the block's four sides: south, east, north, west. */
  sides: readonly (string | null)[];
  zone: DistrictKind;
}

interface Box { x0: number; z0: number; x1: number; z1: number }

const boxOf = (polygon: Polygon): Box => {
  const b = bounds(polygon);
  return { x0: b.min[0], z0: b.min[1], x1: b.max[0], z1: b.max[1] };
};

/** Two rectangles share a stretch of side, not just a corner. */
function sharesSide(a: Box, b: Box): boolean {
  const xs = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const zs = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return (Math.abs(xs) <= EPS && zs > EPS) || (Math.abs(zs) <= EPS && xs > EPS);
}

/** Two rectangles touch or overlap, corners included. */
function touches(a: Box, b: Box): boolean {
  return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) >= -EPS && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) >= -EPS;
}

export class Yards {
  /**
   * The yards of one block, in the order their first rectangle appears.
   * @param bays subway entrance bays: a yard touching one is a forecourt
   * @param working highway land: a yard touching it is a working yard
   */
  static of(block: YardBlock, bays: readonly Polygon[], working: readonly Polygon[], nextId: () => string): BlockYard[] {
    const boxes = block.open.map(boxOf);
    const group = boxes.map((_, index) => index);
    const find = (index: number): number => (group[index] === index ? index : (group[index] = find(group[index])));
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) if (sharesSide(boxes[a], boxes[b])) group[find(b)] = find(a);
    }
    const members = new Map<number, number[]>();
    boxes.forEach((_, index) => members.set(find(index), [...(members.get(find(index)) ?? []), index]));
    const land = boxOf(block.interior);
    const bayBoxes = bays.map(boxOf), workingBoxes = working.map(boxOf);
    return [...members.values()].map((indices) => {
      const parts = indices.map(index => boxes[index]);
      const areas = indices.map(index => block.open[index]);
      const streets = new Set<string>();
      for (const part of parts) {
        const reach: [boolean, number][] = [
          [Math.abs(part.z0 - land.z0) <= EPS, 0], [Math.abs(part.x1 - land.x1) <= EPS, 1],
          [Math.abs(part.z1 - land.z1) <= EPS, 2], [Math.abs(part.x0 - land.x0) <= EPS, 3],
        ];
        for (const [touching, side] of reach) if (touching && block.sides[side]) streets.add(block.sides[side]!);
      }
      return {
        id: nextId(),
        kind: Yards.kind(parts, block.zone, bayBoxes, workingBoxes),
        areas,
        streets: [...streets],
      };
    });
  }

  private static kind(parts: Box[], zone: DistrictKind, bays: Box[], working: Box[]): YardKind {
    if (parts.some(part => bays.some(bay => touches(part, bay)))) return 'forecourt';
    if (parts.every(part => Math.min(part.x1 - part.x0, part.z1 - part.z0) < STRIP_WIDTH)) return 'strip';
    if (parts.some(part => working.some(land => touches(part, land)))) return 'yard';
    return ZONE_KIND[zone];
  }

  /** Total ground of a yard, square metres. */
  static area(yard: BlockYard): number {
    return yard.areas.reduce((sum, polygon) => sum + area(polygon), 0);
  }
}
