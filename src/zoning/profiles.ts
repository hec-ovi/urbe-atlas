/**
 * What a lot must offer a parcel type: the setback from the lot line, the
 * band its footprint keeps end to end, the share of the lot that band must
 * cover and the core rectangle it hosts.
 */
import type { ParcelType, Polygon } from '../../schema/blueprint';
import type { HostingProfile } from '../blocks/Hosting';
import { trimToBand } from '../geom/band';
import { area } from '../geom/polygon';
import { isHeavy, minBand } from './bands';
import { CORE_DEPTH, CORE_WIDTH, WALKUP_CORE_DEPTH, WALKUP_CORE_WIDTH } from './core';

/** Distance from the lot line to the buildable footprint, meters. */
const SETBACK: Partial<Record<ParcelType, number>> = {
  residential: 2,
  factory: 3,
  military: 4,
  hospital: 3,
  mall: 2,
  commerce: 0.5,
  restaurant: 0.5,
  coffee_shop: 0.5,
};
const DEFAULT_SETBACK = 1;

/** A heavy type's band must cover at least this share of the lot; a light type takes any footprint it gets. */
const HEAVY_KEEP = 0.5;

export function setback(type: ParcelType): number {
  return SETBACK[type] ?? DEFAULT_SETBACK;
}

export function hostingProfile(type: ParcelType): HostingProfile {
  const heavy = isHeavy(type);
  return {
    setback: setback(type),
    band: minBand(type),
    core: heavy ? [CORE_WIDTH, CORE_DEPTH] : [WALKUP_CORE_WIDTH, WALKUP_CORE_DEPTH],
    keep: heavy ? HEAVY_KEEP : 0,
  };
}

/** Profiles a lot may build under, in order: its own type, then the light fallback for a heavy type. */
export function hostingProfiles(type: ParcelType, fallback: ParcelType): HostingProfile[] {
  return isHeavy(type) ? [hostingProfile(type), hostingProfile(fallback)] : [hostingProfile(type)];
}

/** Band the raw lot must keep for the type: its footprint band widened by the setback on both sides, meters. */
export function lotBand(type: ParcelType): number {
  return minBand(type) + 2 * setback(type);
}

/** Zoning pre-check on the raw lot: the lot band, trimmed to, covers the type's share of the lot. */
export function lotHosts(lot: Polygon, type: ParcelType): boolean {
  const piece = trimToBand(lot, lotBand(type));
  return piece !== null && area(piece) >= hostingProfile(type).keep * area(lot);
}
