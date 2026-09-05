/** Shared curb, alley and highway dimensions in metres. */
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
export const HIGHWAY_WIDTH = 15;

/** Widest band one side of an alley may take, so the pair stays within ALLEY_WIDTH. */
const ALLEY_SIDE_MAX = ALLEY_WIDTH[1] / 2;

/** Alley halves meet at their centerline and retain their own pedestrian scale. */
export function alleySideWidth(district: DistrictKind): number {
  const wide = district === 'downtown' || district === 'commercial';
  return wide ? ALLEY_SIDE_MAX : district === 'industrial' ? 2 : 1.8;
}
