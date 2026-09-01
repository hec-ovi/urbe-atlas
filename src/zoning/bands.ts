/**
 * Minimum footprint band per parcel type: the width a footprint must keep
 * between its two long sides along its whole length, so the interior core of
 * that type always fits behind the shell wall (orchestrator ruling of
 * 2026-09-01 on interior 0.18: the heavy band is interior's 11 m core band
 * plus up to 0.5 m of wall each side).
 */
import type { ParcelType } from '../../schema/blueprint';

/** Band for elevator-core types, meters. */
export const HEAVY_BAND = 12;
/** Band for walkup-core types, meters. */
export const LIGHT_BAND = 8.5;

const HEAVY_TYPES: ReadonlySet<ParcelType> = new Set<ParcelType>(['offices', 'corpo', 'hotel', 'hospital', 'mall', 'factory']);

/** Elevator-core type: its footprint needs the heavy band and the elevator core. */
export function isHeavy(type: ParcelType): boolean {
  return HEAVY_TYPES.has(type);
}

/** Band the type's footprint must host end to end, meters. */
export function minBand(type: ParcelType): number {
  return isHeavy(type) ? HEAVY_BAND : LIGHT_BAND;
}
