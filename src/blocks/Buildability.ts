/**
 * Buildability: a lot becomes a parcel only when it hosts one of its profiles
 * (its type's, then a lighter fallback). Lots are cut to standard sizes, so a
 * lot that hosts none is not reshaped: it stays open area, and its block keeps
 * exact coverage.
 */
import type { Polygon } from '../../schema/blueprint';
import { FootprintHost, HostedFootprint, HostingProfile } from '../zoning/FootprintHost';

export interface LotCandidate {
  polygon: Polygon;
  blockIndex: number;
  /** Profiles to try in order; the first hosted one shapes the footprint. */
  profiles: HostingProfile[];
}

export interface BuildableLot {
  /** Position of this lot in the input array. */
  index: number;
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

export class Buildability {
  static enforce(lots: LotCandidate[], hoster: FootprintHost): BuildabilityResult {
    const survivors: BuildableLot[] = [];
    const openAreas = new Map<number, Polygon[]>();
    lots.forEach((lot, index) => {
      const hosted = host(lot.polygon, lot.profiles, hoster);
      if (hosted) { survivors.push({ index, polygon: lot.polygon, ...hosted }); return; }
      const list = openAreas.get(lot.blockIndex) ?? [];
      list.push(lot.polygon);
      openAreas.set(lot.blockIndex, list);
    });
    return { lots: survivors, openAreas };
  }
}

/** First profile the lot hosts, with the footprint it yields. */
function host(lot: Polygon, profiles: HostingProfile[], hoster: FootprintHost): (HostedFootprint & { profile: number }) | null {
  for (let k = 0; k < profiles.length; k++) {
    const hosted = hoster.fit(lot, profiles[k]);
    if (hosted) return { ...hosted, profile: k };
  }
  return null;
}
