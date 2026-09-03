import type { AtlasParams, DistrictKind, FeatureToggles, WealthTier } from '../../schema/params';
import { invalidParams, unsatisfiable } from '../errors';
import { validateHydrologyParams } from '../hydro/Hydrology';
import type { HydrologyParams } from '../hydro/types';

export interface ResolvedParams {
  seed: string | number;
  size: { width: number; depth: number };
  irregularity: number;
  districtCount: [number, number];
  maxFloors: number;
  maxFloorsByDistrict: Partial<Record<DistrictKind, number>>;
  tierWeights: Record<WealthTier, number>;
  features: Required<FeatureToggles>;
  hydrology?: HydrologyParams;
}

/** Minimum ground area a district needs to hold blocks and streets. */
const MIN_DISTRICT_AREA = 90_000; // 300 m x 300 m
const DISTRICT_KINDS: DistrictKind[] = ['downtown', 'commercial', 'residential', 'industrial', 'mixed'];
const WEALTH_TIERS: WealthTier[] = ['poor', 'mid', 'rich', 'high_rich'];
const FEATURE_KEYS: (keyof FeatureToggles)[] = [
  'highways', 'trains', 'subways', 'alleys', 'airTunnels', 'undergroundTunnels',
];

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
  if ((typeof seed !== 'string' && typeof seed !== 'number') || (typeof seed === 'number' && !Number.isFinite(seed))) {
    throw invalidParams('seed is required and must be a string or number', { field: 'seed' });
  }

  if (input.size !== undefined && !isRecord(input.size)) {
    throw invalidParams('size must be an object', { field: 'size' });
  }
  const size = input.size ?? { width: 1000, depth: 1000 };
  if (!Number.isFinite(size.width) || !Number.isFinite(size.depth)
    || !(size.width > 0) || !(size.depth > 0)) {
    throw invalidParams('size.width and size.depth must be positive meters', { field: 'size' });
  }

  const irregularity = input.irregularity ?? 0.35;
  if (!(irregularity >= 0 && irregularity <= 1)) {
    throw invalidParams('irregularity must be in [0, 1]', { field: 'irregularity' });
  }

  if (input.districtCount !== undefined && !Array.isArray(input.districtCount)) {
    throw invalidParams('districtCount must be [min, max]', { field: 'districtCount' });
  }
  const districtCount = input.districtCount ?? defaultDistrictCount(size.width * size.depth);
  if (!Array.isArray(districtCount) || districtCount.length !== 2) {
    throw invalidParams('districtCount must be [min, max]', { field: 'districtCount' });
  }
  const [dMin, dMax] = districtCount;
  if (!Number.isInteger(dMin) || !Number.isInteger(dMax) || dMin < 1 || dMin > dMax) {
    throw invalidParams('districtCount must be integers with 1 <= min <= max', { field: 'districtCount' });
  }

  const maxFloors = input.maxFloors ?? 40;
  if (!Number.isInteger(maxFloors) || maxFloors < 1) {
    throw invalidParams('maxFloors must be an integer >= 1', { field: 'maxFloors' });
  }
  if (input.maxFloorsByDistrict !== undefined && !isRecord(input.maxFloorsByDistrict)) {
    throw invalidParams('maxFloorsByDistrict must be an object', { field: 'maxFloorsByDistrict' });
  }
  const maxFloorsByDistrict = input.maxFloorsByDistrict ?? {};
  for (const [kind, floors] of Object.entries(maxFloorsByDistrict)) {
    if (!DISTRICT_KINDS.includes(kind as DistrictKind) || !Number.isInteger(floors) || (floors as number) < 1) {
      throw invalidParams(`maxFloorsByDistrict.${kind} must be an integer >= 1`, { field: 'maxFloorsByDistrict' });
    }
  }

  if (input.tierWeights !== undefined && !isRecord(input.tierWeights)) {
    throw invalidParams('tierWeights must be an object', { field: 'tierWeights' });
  }
  for (const tier of Object.keys(input.tierWeights ?? {})) {
    if (!WEALTH_TIERS.includes(tier as WealthTier)) {
      throw invalidParams(`tierWeights.${tier} is not a wealth tier`, { field: 'tierWeights' });
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
    if (!Number.isFinite(w) || !(w >= 0)) throw invalidParams(`tierWeights.${tier} must be >= 0`, { field: 'tierWeights' });
    weightSum += w;
  }
  if (weightSum <= 0) throw invalidParams('tierWeights must not all be zero', { field: 'tierWeights' });

  if (input.features !== undefined && !isRecord(input.features)) {
    throw invalidParams('features must be an object', { field: 'features' });
  }
  for (const [feature, enabled] of Object.entries(input.features ?? {})) {
    if (!FEATURE_KEYS.includes(feature as keyof FeatureToggles) || typeof enabled !== 'boolean') {
      throw invalidParams(`features.${feature} must be boolean`, { field: 'features' });
    }
  }
  const featureInput = input.features as FeatureToggles | undefined;
  const features: Required<FeatureToggles> = {
    highways: featureInput?.highways ?? true,
    trains: featureInput?.trains ?? true,
    subways: featureInput?.subways ?? true,
    alleys: featureInput?.alleys ?? true,
    airTunnels: featureInput?.airTunnels ?? true,
    undergroundTunnels: featureInput?.undergroundTunnels ?? true,
  };

  if (input.hydrology !== undefined) validateHydrologyParams(input.hydrology);

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
    ...(input.hydrology ? { hydrology: { ...input.hydrology } } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
