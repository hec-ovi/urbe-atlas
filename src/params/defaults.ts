import type { AtlasParams, DistrictKind, FeatureToggles, WealthTier } from '../../schema/params';
import { invalidParams, unsatisfiable } from '../errors';

export interface ResolvedParams {
  seed: string | number;
  size: { width: number; depth: number };
  irregularity: number;
  districtCount: [number, number];
  maxFloors: number;
  maxFloorsByDistrict: Partial<Record<DistrictKind, number>>;
  tierWeights: Record<WealthTier, number>;
  features: Required<FeatureToggles>;
}

/** Minimum ground area a district needs to hold blocks and streets. */
const MIN_DISTRICT_AREA = 90_000; // 300 m x 300 m

/**
 * Default district count scales with city area: around 2 per sqrt(km2),
 * so a village gets 1-3 districts and the default 3 km city 4-8.
 */
function defaultDistrictCount(areaM2: number): [number, number] {
  const c = 2 * Math.sqrt(areaM2 / 1_000_000);
  const min = Math.max(1, Math.round(0.7 * c));
  const max = Math.max(min, Math.round(1.3 * c));
  return [min, max];
}

export function resolveParams(input: AtlasParams): ResolvedParams {
  if (input === null || typeof input !== 'object') {
    throw invalidParams('params must be an object');
  }
  const { seed } = input;
  if (typeof seed !== 'string' && typeof seed !== 'number') {
    throw invalidParams('seed is required and must be a string or number', { field: 'seed' });
  }

  const size = input.size ?? { width: 3000, depth: 3000 };
  if (!(size.width > 0) || !(size.depth > 0)) {
    throw invalidParams('size.width and size.depth must be positive meters', { field: 'size' });
  }

  const irregularity = input.irregularity ?? 0.6;
  if (!(irregularity >= 0 && irregularity <= 1)) {
    throw invalidParams('irregularity must be in [0, 1]', { field: 'irregularity' });
  }

  const districtCount = input.districtCount ?? defaultDistrictCount(size.width * size.depth);
  const [dMin, dMax] = districtCount;
  if (!Number.isInteger(dMin) || !Number.isInteger(dMax) || dMin < 1 || dMin > dMax) {
    throw invalidParams('districtCount must be integers with 1 <= min <= max', { field: 'districtCount' });
  }

  const maxFloors = input.maxFloors ?? 40;
  if (!Number.isInteger(maxFloors) || maxFloors < 1) {
    throw invalidParams('maxFloors must be an integer >= 1', { field: 'maxFloors' });
  }
  const maxFloorsByDistrict = input.maxFloorsByDistrict ?? {};
  for (const [kind, floors] of Object.entries(maxFloorsByDistrict)) {
    if (!Number.isInteger(floors) || (floors as number) < 1) {
      throw invalidParams(`maxFloorsByDistrict.${kind} must be an integer >= 1`, { field: 'maxFloorsByDistrict' });
    }
  }

  const tierWeights: Record<WealthTier, number> = {
    poor: 0.3,
    mid: 0.45,
    rich: 0.2,
    high_rich: 0.05,
    ...input.tierWeights,
  };
  let weightSum = 0;
  for (const [tier, w] of Object.entries(tierWeights)) {
    if (!(w >= 0)) throw invalidParams(`tierWeights.${tier} must be >= 0`, { field: 'tierWeights' });
    weightSum += w;
  }
  if (weightSum <= 0) throw invalidParams('tierWeights must not all be zero', { field: 'tierWeights' });

  const features: Required<FeatureToggles> = {
    highways: input.features?.highways ?? true,
    trains: input.features?.trains ?? true,
    subways: input.features?.subways ?? true,
    alleys: input.features?.alleys ?? true,
    airTunnels: input.features?.airTunnels ?? true,
    undergroundTunnels: input.features?.undergroundTunnels ?? true,
  };

  if (size.width * size.depth < dMin * MIN_DISTRICT_AREA) {
    throw unsatisfiable(
      `size ${size.width}x${size.depth} m cannot hold ${dMin} districts; need >= ${MIN_DISTRICT_AREA} m2 each`,
      { field: 'districtCount', minArea: dMin * MIN_DISTRICT_AREA },
    );
  }

  return {
    seed,
    size: { width: size.width, depth: size.depth },
    irregularity,
    districtCount: [dMin, dMax],
    maxFloors,
    maxFloorsByDistrict,
    tierWeights,
    features,
  };
}
