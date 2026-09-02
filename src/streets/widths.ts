/** Street dimension defaults, meters (NACTO / Seattle Streets Illustrated ranges). */
import type { StreetClass } from '../../schema/blueprint';
import type { DistrictKind } from '../../schema/params';

/**
 * The kerb: a band of ground between the roadway and the sidewalk, its own
 * surface so materials border there instead of butting one texture against
 * another. It is the outer edge of the sidewalk band, so the published
 * sidewalk width includes it. An alley has no roadway and so no kerb.
 */
export const CURB_WIDTH = 0.15;

/** An alley is this wide, ground to ground, all of it sidewalk. */
export const ALLEY_WIDTH: [min: number, max: number] = [3, 5];

/** Widest band one side of an alley may take, so the pair stays within ALLEY_WIDTH. */
const ALLEY_SIDE_MAX = ALLEY_WIDTH[1] / 2;

export function carriagewayWidth(cls: StreetClass): number {
  switch (cls) {
    case 'highway':
      return 15;
    case 'road':
      return 10;
    case 'street':
      return 7;
    case 'alley':
      return 0; // pedestrian only
  }
}

/** Per-side sidewalk width; wider in dense centers, none on highways. */
export function sidewalkWidth(cls: StreetClass, district: DistrictKind | undefined): number {
  if (cls === 'highway') return 0;
  const wide = district === 'downtown' || district === 'commercial';
  if (cls === 'road') return wide ? 3.2 : 2.4;
  const street = wide ? 2.8 : district === 'industrial' ? 2.0 : 1.8;
  // an alley is two sidewalks meeting at its centerline: keep the pair narrow
  return cls === 'alley' ? Math.min(street, ALLEY_SIDE_MAX) : street;
}
