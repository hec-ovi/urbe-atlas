/**
 * atlas input parameters.
 * Units: meters. Ground plane is XZ, +Y up; 2D points are [x, z].
 * Only `seed` is required; every other field has the documented default.
 */

export type Seed = string | number;

export type DistrictKind = 'downtown' | 'commercial' | 'residential' | 'industrial' | 'mixed';

export type WealthTier = 'poor' | 'mid' | 'rich' | 'high_rich';
export type FootprintShape = 'rectangle' | 'parcel';
import type { StreetDesign } from '../src/streets/construction/schema/design';
export type { StreetDesign } from '../src/streets/construction/schema/design';
import type { PavingDesign } from '../src/streets/construction/paving/schema';
export type { PavingDesign } from '../src/streets/construction/paving/schema';

export interface AtlasParams {
  seed: Seed;
  /** Rectangular city extent in meters. Default { width: 1000, depth: 1000 }. */
  size?: { width: number; depth: number };
  /** Retained for saved parameter compatibility, range 0..1. The module grid follows world X/Z axes. Default 0. */
  irregularity?: number;
  /** Building footprints on the shared city grid, or explicit lot-following shapes. Default rectangle. */
  footprintShape?: FootprintShape;
  /** Numeric road and sidewalk profiles, resolved before parcels. Defaults to the construction catalog. */
  streetDesign?: StreetDesign;
  /** Optional caller-selected finish families. City geometry uses the dimensioned module catalog. */
  pavingDesign?: PavingDesign;
  /** District count range, inclusive. Default scales with area (about 2 per sqrt(km2), range 0.7x-1.3x): a village gets [1, 2-3], the default 3 km city [4, 8]. */
  districtCount?: [min: number, max: number];
  /** Global building floor cap. Default 40. */
  maxFloors?: number;
  /** Floor cap per district kind; overrides maxFloors where set. */
  maxFloorsByDistrict?: Partial<Record<DistrictKind, number>>;
  /** Wealth mix weights, normalized internally. Default { poor: 0.3, mid: 0.45, rich: 0.2, high_rich: 0.05 }. */
  tierWeights?: Partial<Record<WealthTier, number>>;
  features?: FeatureToggles;
  /** Optional deterministic water reservation. Omitted means no hydrology and preserves legacy output. */
  hydrology?: HydrologyParams;
}

export type { HydrologyParams, HydrologyType } from '../src/hydro/types';

export interface FeatureToggles {
  /** Generate highways. Default true. */
  highways?: boolean;
  /** Generate train stations and lines. Default true. */
  trains?: boolean;
  /** Generate alleys: narrow pedestrian cuts through long blocks. Default true. */
  alleys?: boolean;
  /** Generate subway stations and lines. Default true. */
  subways?: boolean;
  /** Permit above-ground tube/bridge connections downstream. Echoed in blueprint meta; atlas draws no geometry for it. Default true. */
  airTunnels?: boolean;
  /** Permit underground connections downstream. Echoed in blueprint meta. Default true. */
  undergroundTunnels?: boolean;
}
import type { HydrologyParams } from '../src/hydro/types';
