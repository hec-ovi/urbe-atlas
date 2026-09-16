import type { SidewalkSectionRecord } from '../construction/schema/sections';
import { sideSection } from './Sections';

const depth = 2.5;
const clearWidth = 3.5;

/** The bay plus its shifted curb/gutter leaves the rear3.5m as sole walking space. */
export function supportsNativeParking(side: SidewalkSectionRecord): boolean {
  return side.geometry?.pavedWidth === depth + clearWidth && side.bands.walking <= clearWidth
    || Math.abs((side.geometry?.pavedWidth ?? 0) - 4.2) < 1e-8 && side.geometry?.edge.gutter.width === 0.5 && side.bands.walking <= 2;
}

export function parkingSection(side: SidewalkSectionRecord): SidewalkSectionRecord {
  if (side.geometry!.edge.gutter.width === 0.5) return sideSection({ id: `${side.profileId}-parking`, curb: side.bands.curb,
    border: 1, furnishing: 1, walking: 2, frontage: 0.2, edge: side.geometry!.edge });
  const border = Math.min(side.bands.border, depth);
  return sideSection({ id: `${side.profileId}-parking`, curb: side.bands.curb,
    border, furnishing: depth - border, walking: clearWidth, frontage: 0, edge: side.geometry!.edge });
}
