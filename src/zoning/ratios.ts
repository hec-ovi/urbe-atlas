/**
 * Urban ratios the zoner applies, grounded in docs/RESEARCH.md
 * (URDPFI, AHA, BJS, City Observatory, IBISWorld, AHLA, ICSC).
 * Residents-per-facility drives facility counts.
 */
import type { ParcelType } from '../../schema/blueprint';

/** Gross floor area per resident, m2 (dwelling + common). */
export const FLOOR_AREA_PER_RESIDENT = 35;

/** Usable share of a residential floor plate. */
export const RESIDENTIAL_EFFICIENCY = 0.8;

/** Residents per one facility of each type; assignment tops up to ceil(pop/ratio). */
export const RESIDENTS_PER_FACILITY: Partial<Record<ParcelType, number>> = {
  hospital: 75_000,
  clinic: 15_000,
  police: 50_000,
  military: 400_000,
  mall: 90_000,
  hotel: 5_500,
  restaurant: 550,
  coffee_shop: 3_000,
  commerce: 400,
};

/** Facility types that prefer a road-adjacent, large, central parcel. */
export const ANCHOR_FACILITIES: ParcelType[] = ['hospital', 'police', 'military', 'mall'];

/** Minimum lot area demanded by each facility type, m2. */
export const MIN_FACILITY_AREA: Partial<Record<ParcelType, number>> = {
  hospital: 4_000,
  clinic: 400,
  police: 1_200,
  military: 6_000,
  mall: 2_800,
  hotel: 800,
  restaurant: 150,
  coffee_shop: 80,
  commerce: 100,
};
