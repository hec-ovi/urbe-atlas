/**
 * Buildability: a lot becomes a parcel only when its footprint can host the
 * walkup core. A lot below that merges into the neighbour it shares the most
 * boundary with (the neighbour keeps its type, tier and envelope), and turns
 * into open area when it has no neighbour. Merging cascades: the grown lot is
 * retested, so a pair that still cannot build ends as open area. Lot area is
 * never lost, it only changes owner, which keeps block coverage exact.
 */
import type { Polygon } from '../../schema/blueprint';
import { intersection, offset, union } from '../geom/clip';
import { area, bounds } from '../geom/polygon';
import { fitsWalkupCore } from '../zoning/core';

export interface LotCandidate {
  polygon: Polygon;
  blockIndex: number;
  /** Distance from the lot boundary to the buildable footprint, meters. */
  setback: number;
}

export interface BuildableLot {
  /** Position of this lot in the input array. */
  index: number;
  /** Lot polygon, grown when it absorbed a neighbour. */
  polygon: Polygon;
  footprint: Polygon;
}

export interface BuildabilityResult {
  lots: BuildableLot[];
  /** Lots demoted to open area, by block index. */
  openAreas: Map<number, Polygon[]>;
}

/** Buildable area of a lot: the lot inset by its setback, largest piece. */
function footprintOf(lot: Polygon, setback: number): Polygon {
  const inset = offset([lot], -setback).sort((a, b) => area(b) - area(a));
  return inset[0] ?? lot;
}

/** Probe width used to measure a shared boundary, meters. */
const TOUCH = 0.25;
/** Shared boundary a merge needs, meters. */
const MIN_SHARED = 2;

export class Buildability {
  static enforce(lots: LotCandidate[]): BuildabilityResult {
    const polygons = lots.map((l) => l.polygon);
    const footprints = lots.map((l) => footprintOf(l.polygon, l.setback));
    const alive = lots.map(() => true);
    const openAreas = new Map<number, Polygon[]>();
    const lotsOfBlock = new Map<number, number[]>();
    lots.forEach((l, i) => {
      const list = lotsOfBlock.get(l.blockIndex) ?? [];
      list.push(i);
      lotsOfBlock.set(l.blockIndex, list);
    });

    const demote = (i: number): void => {
      alive[i] = false;
      const list = openAreas.get(lots[i].blockIndex) ?? [];
      list.push(polygons[i]);
      openAreas.set(lots[i].blockIndex, list);
    };

    const queue = lots.map((_, i) => i).filter((i) => !fitsWalkupCore(footprints[i]));
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      if (!alive[i] || fitsWalkupCore(footprints[i])) continue;
      const host = bestNeighbour(i, polygons, alive, lotsOfBlock.get(lots[i].blockIndex)!);
      const merged = host === null ? [] : union([polygons[host], polygons[i]]);
      if (host === null || merged.length !== 1) {
        demote(i);
        continue;
      }
      alive[i] = false;
      polygons[host] = merged[0];
      footprints[host] = footprintOf(merged[0], lots[host].setback);
      if (!fitsWalkupCore(footprints[host])) queue.push(host);
    }

    const survivors: BuildableLot[] = [];
    for (let i = 0; i < lots.length; i++) {
      if (alive[i]) survivors.push({ index: i, polygon: polygons[i], footprint: footprints[i] });
    }
    return { lots: survivors, openAreas };
  }
}

/** Alive lot of the same block sharing the longest boundary, lowest index on a tie. */
function bestNeighbour(i: number, polygons: Polygon[], alive: boolean[], blockLots: number[]): number | null {
  const probe = offset([polygons[i]], TOUCH);
  const near = bounds(polygons[i]);
  let best: number | null = null;
  let bestShared = MIN_SHARED;
  for (const j of blockLots) {
    if (j === i || !alive[j]) continue;
    if (!boundsOverlap(near, bounds(polygons[j]))) continue;
    let overlap = 0;
    for (const piece of intersection(probe, [polygons[j]])) overlap += area(piece);
    const shared = overlap / TOUCH;
    if (shared > bestShared + 1e-9) {
      bestShared = shared;
      best = j;
    }
  }
  return best;
}

type Bounds = { min: [number, number]; max: [number, number] };

function boundsOverlap(a: Bounds, b: Bounds): boolean {
  const pad = TOUCH * 2;
  return (
    a.min[0] - pad <= b.max[0] && b.min[0] - pad <= a.max[0] && a.min[1] - pad <= b.max[1] && b.min[1] - pad <= a.max[1]
  );
}
