/**
 * Public squares: the corner lots a district opens at its most central
 * crossings, so a walk through the grid meets open public ground at the
 * places it gathers instead of one built block face after another.
 *
 * Each district of three or more blocks opens one square, and one more for
 * every 16 blocks it has. A square is the standard lot whose corner stands
 * nearest a crossing: avenue crossings first, then any crossing of three or
 * more grade streets, nearest the district centre first. A landmark lot, an
 * anchor (hospital, police, military, mall) and a second lot of a block that
 * already opened one are passed over. The choice is a pure function of the
 * plan, so the same city opens the same squares.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import { dist } from '../geom/vec';

/** Uses a city keeps on its own lot whatever the square would gain. */
const ANCHORS = new Set(['hospital', 'police', 'military', 'mall']);
/** Blocks a district needs for its first square, and for each square after it. */
const FIRST = 3, EVERY = 16;
/** A lot whose corner is further than this from the crossing does not face it. */
const REACH = 32;

export interface SquareLot {
  polygon: Polygon;
  blockIndex: number;
  districtIndex: number;
  /** A standard lot; a landmark is never a square. */
  standard: boolean;
  /** The use zoning gave the lot. */
  type: string;
}

export interface SquareCrossing {
  position: Vec2;
  /** Avenues (`road` edges) meeting there. */
  roads: number;
}

/**
 * The lots that open as squares, by their index in `lots`.
 * @param centres each district's centre, by district index
 * @param blocks each district's block count, by district index
 */
export function publicSquares(lots: readonly SquareLot[], crossings: readonly SquareCrossing[],
  centres: readonly Vec2[], blocks: readonly number[]): Set<number> {
  const chosen = new Set<number>();
  const opened = new Set<number>();
  centres.forEach((centre, district) => {
    const wanted = blocks[district] >= FIRST ? 1 + Math.floor(blocks[district] / EVERY) : 0;
    if (!wanted) return;
    const order = [...crossings].sort((a, b) => Number(b.roads >= 2) - Number(a.roads >= 2)
      || dist(a.position, centre) - dist(b.position, centre)
      || a.position[0] - b.position[0] || a.position[1] - b.position[1]);
    let count = 0;
    for (const crossing of order) {
      if (count >= wanted) break;
      let best = -1, bestDistance = REACH;
      lots.forEach((lot, index) => {
        if (lot.districtIndex !== district || !lot.standard || ANCHORS.has(lot.type) || chosen.has(index) || opened.has(lot.blockIndex)) return;
        const near = Math.min(...lot.polygon.map(corner => dist(corner, crossing.position)));
        if (near < bestDistance) {
          best = index;
          bestDistance = near;
        }
      });
      if (best < 0) continue;
      chosen.add(best);
      opened.add(lots[best].blockIndex);
      count++;
    }
  });
  return chosen;
}
