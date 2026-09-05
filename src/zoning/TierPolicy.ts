import type { WealthTier, DistrictKind } from '../../schema/params';
import type { Rng } from '../core/rng';

export const TIERS: WealthTier[] = ['poor', 'mid', 'rich', 'high_rich'];
const NEIGHBOR_SHARE = 0.12;
const INDUSTRIAL_POOR_SHARE = 0.75;

export function parcelTier(districtTier: WealthTier, kind: DistrictKind, rng: Rng): WealthTier {
  if (kind === 'industrial') return rng.chance(INDUSTRIAL_POOR_SHARE) ? 'poor' : 'mid';
  let index = TIERS.indexOf(districtTier);
  const roll = rng.next();
  if (roll < NEIGHBOR_SHARE) index = Math.max(0, index - 1);
  else if (roll > 1 - NEIGHBOR_SHARE) index = Math.min(TIERS.length - 1, index + 1);
  return TIERS[index];
}

export function tierShares(districtTier: WealthTier, kind: DistrictKind): [WealthTier, number][] {
  if (kind === 'industrial') return [['poor', INDUSTRIAL_POOR_SHARE], ['mid', 1 - INDUSTRIAL_POOR_SHARE]];
  const index = TIERS.indexOf(districtTier);
  return [
    [TIERS[Math.max(0, index - 1)], NEIGHBOR_SHARE],
    [districtTier, 1 - NEIGHBOR_SHARE * 2],
    [TIERS[Math.min(TIERS.length - 1, index + 1)], NEIGHBOR_SHARE],
  ];
}
