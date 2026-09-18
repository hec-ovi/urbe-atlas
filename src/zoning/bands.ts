/**
 * Minimum footprint band per parcel type: the width a footprint must keep
 * between its two long sides along its whole length, the short side of the
 * core rectangle its type hosts (see core.ts).
 */
import type { BuildingParcelType } from '../../schema/blueprint';
import { COMPACT_RECT, WALKUP_RECT } from './core';

/** Band for elevator-core types, meters. */
export const HEAVY_BAND = Math.min(...COMPACT_RECT);
/** Band for walkup-core types, meters. */
export const LIGHT_BAND = Math.min(...WALKUP_RECT);

const HEAVY_TYPES: ReadonlySet<BuildingParcelType> = new Set<BuildingParcelType>(['offices', 'corpo', 'hotel', 'hospital', 'mall', 'factory']);

/** Elevator-core type: its footprint needs the heavy band and the compact elevator core. */
export function isHeavy(type: BuildingParcelType): boolean {
  return HEAVY_TYPES.has(type);
}

/** Band the type's footprint must host end to end, meters. */
export function minBand(type: BuildingParcelType): number {
  return isHeavy(type) ? HEAVY_BAND : LIGHT_BAND;
}
