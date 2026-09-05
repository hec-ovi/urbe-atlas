import { invalidParams } from '../errors';
import { expectedResidentialFloors } from './envelopes';
import { residentialCapacity } from './ResidentialCapacity';
import { tierShares, TIERS } from './TierPolicy';
import { BASE_MIX } from './UseMix';
import type { DistrictCapacityInput, PopulationForecast } from './population-schema';

/** Expected residential capacity of uncut district land under the zoning policy. */
export function populationForecast(input: readonly DistrictCapacityInput[]): PopulationForecast {
  if (!Array.isArray(input)) throw invalidParams('district capacity must be an array');
  const ids = new Set<string>();
  const districts = input.map((district: DistrictCapacityInput) => {
    if (!district || typeof district !== 'object' || typeof district.districtId !== 'string'
      || district.districtId.length === 0 || ids.has(district.districtId)
      || !Object.hasOwn(BASE_MIX, district.kind) || !TIERS.includes(district.tier)
      || !Number.isInteger(district.maxFloors) || district.maxFloors < 1
      || !Number.isFinite(district.landArea) || district.landArea < 0) {
      throw invalidParams('district capacity requires a unique id, valid kind and tier, positive floor cap and nonnegative land area');
    }
    ids.add(district.districtId);
    const mix = BASE_MIX[district.kind];
    const share = (mix.find(([type]) => type === 'residential')?.[1] ?? 0) / mix.reduce((sum, [, weight]) => sum + weight, 0);
    const residentialArea = district.landArea * share;
    const meanResidentialFloors = tierShares(district.tier, district.kind).reduce((sum, [tier, weight]) =>
      sum + expectedResidentialFloors(tier, district.maxFloors) * weight, 0);
    return {
      districtId: district.districtId, residentialArea, meanResidentialFloors,
      populationEstimate: Math.round(residentialCapacity(residentialArea, meanResidentialFloors)),
    };
  });
  return { populationEstimate: districts.reduce((sum, district) => sum + district.populationEstimate, 0), districts };
}
