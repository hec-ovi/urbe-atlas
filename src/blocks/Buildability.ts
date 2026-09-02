/**
 * Buildability: a lot becomes a parcel only when it hosts one of its
 * profiles (its type's, then a lighter fallback). A lot hosting none merges
 * into the neighbour it shares the most boundary with (the neighbour keeps
 * its profiles) and turns into open area when it has no neighbour. Merging
 * cascades: the grown lot is retested, so a pair that still hosts nothing
 * ends as open area. Lot area is never lost, it only changes owner, which
 * keeps block coverage exact.
 */
import type { Polygon } from '../../schema/blueprint';
import { intersection, offset, union } from '../geom/clip';
import { area, bounds } from '../geom/polygon';
import { hostFootprint, HostedFootprint, HostingProfile } from './Hosting';

export interface LotCandidate {
  polygon: Polygon;
  blockIndex: number;
  /** Profiles to try in order; the first hosted one shapes the footprint. */
  profiles: HostingProfile[];
}

export interface BuildableLot {
  /** Position of this lot in the input array. */
  index: number;
  /** Lot polygon, grown when it absorbed a neighbour. */
  polygon: Polygon;
  footprint: Polygon;
  /** Floors the hosted core allows, Infinity with an elevator core. */
  floorCap: number;
  /** Index of the hosted profile in the lot's list. */
  profile: number;
}

export interface BuildabilityResult {
  lots: BuildableLot[];
  /** Lots demoted to open area, by block index. */
  openAreas: Map<number, Polygon[]>;
}

interface Hosted extends HostedFootprint {
  profile: number;
}

/** Probe width used to measure a shared boundary, meters. */
const TOUCH = 0.25;
/** Shared boundary a merge needs, meters. */
const MIN_SHARED = 2;

export class Buildability {
  static enforce(lots: LotCandidate[]): BuildabilityResult {
    const polygons = lots.map((l) => l.polygon);
    const hosted = lots.map((l) => host(l.polygon, l.profiles));
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

    const queue = lots.map((_, i) => i).filter((i) => hosted[i] === null);
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      if (!alive[i] || hosted[i] !== null) continue;
      const neighbour = bestNeighbour(i, polygons, alive, lotsOfBlock.get(lots[i].blockIndex)!);
      const merged = neighbour === null ? [] : union([polygons[neighbour], polygons[i]]);
      if (neighbour === null || merged.length !== 1) {
        demote(i);
        continue;
      }
      alive[i] = false;
      polygons[neighbour] = merged[0];
      hosted[neighbour] = host(merged[0], lots[neighbour].profiles);
      if (hosted[neighbour] === null) queue.push(neighbour);
    }

    const survivors: BuildableLot[] = [];
    for (let i = 0; i < lots.length; i++) {
      const h = hosted[i];
      if (alive[i] && h) survivors.push({ index: i, polygon: polygons[i], ...h });
    }
    return { lots: survivors, openAreas };
  }
}

/** First profile the lot hosts, with the footprint it yields. */
function host(lot: Polygon, profiles: HostingProfile[]): Hosted | null {
  for (let k = 0; k < profiles.length; k++) {
    const hosted = hostFootprint(lot, profiles[k]);
    if (hosted) return { ...hosted, profile: k };
  }
  return null;
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
