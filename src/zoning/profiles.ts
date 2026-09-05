/**
 * What a lot must offer a parcel type: the setback from the lot line, the
 * band its footprint keeps end to end, the share of the lot that band must
 * cover and the core it hosts.
 */
import type { ParcelType, Polygon } from '../../schema/blueprint';
import type { FootprintHost, HostingProfile } from './FootprintHost';
import { isHeavy, minBand } from './bands';

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
  return { setback: setback(type), band: minBand(type), heavy, keep: heavy ? HEAVY_KEEP : 0 };
}

/** Profiles a lot may build under, in order: its own type, then the light fallback for a heavy type. */
export function hostingProfiles(type: ParcelType, fallback: ParcelType): HostingProfile[] {
  return isHeavy(type) ? [hostingProfile(type), hostingProfile(fallback)] : [hostingProfile(type)];
}

/** Eligibility and final construction use the same inset, shape and core calculation. */
export function lotHosts(lot: Polygon, type: ParcelType, host: FootprintHost): boolean {
  return host.fit(lot, hostingProfile(type)) !== null;
}
