/**
 * Building envelope defaults per parcel type and wealth tier,
 * from the zoning table in docs/RESEARCH.md (NYC/HK FAR codes, CTBUH,
 * walk-up elevator cap, warehouse clear heights).
 */
import type { Envelope, ParcelType } from '../../schema/blueprint';
import type { WealthTier } from '../../schema/params';
import type { Rng } from '../core/rng';

/** Nominal floor height, meters, by type. */
const FLOOR_HEIGHT: Record<ParcelType, number> = {
  residential: 2.9,
  hotel: 3.2,
  offices: 4.0,
  corpo: 4.6,
  hospital: 4.0,
  clinic: 3.4,
  police: 3.6,
  military: 3.6,
  factory: 10.0,
  commerce: 4.5,
  mall: 5.5,
  restaurant: 4.3,
  coffee_shop: 4.3,
};

/** Residential shape differs per tier: walk-ups, mid-rise, villas, towers. */
const RESIDENTIAL_BAND: Record<WealthTier, [number, number]> = {
  poor: [3, 6],
  mid: [4, 12],
  rich: [1, 3],
  high_rich: [12, 40],
};

const RESIDENTIAL_FLOOR_HEIGHT: Record<WealthTier, number> = {
  poor: 2.7,
  mid: 2.9,
  rich: 3.2,
  high_rich: 3.7,
};

/** Typical floor-count band per non-residential type before tier and district caps. */
const FLOOR_BAND: Record<Exclude<ParcelType, 'residential'>, [number, number]> = {
  hotel: [5, 20],
  offices: [6, 30],
  corpo: [20, 60],
  hospital: [4, 10],
  clinic: [1, 3],
  police: [2, 4],
  military: [1, 4],
  factory: [1, 2],
  commerce: [1, 3],
  mall: [1, 3],
  restaurant: [1, 2],
  coffee_shop: [1, 2],
};

const TIER_FLOOR_FACTOR: Record<WealthTier, number> = {
  poor: 0.6,
  mid: 0.85,
  rich: 1.0,
  high_rich: 1.2,
};

export function makeEnvelope(type: ParcelType, tier: WealthTier, districtMaxFloors: number, rng: Rng): Envelope {
  let lo: number;
  let hi: number;
  let floorHeight: number;
  if (type === 'residential') {
    [lo, hi] = RESIDENTIAL_BAND[tier];
    floorHeight = RESIDENTIAL_FLOOR_HEIGHT[tier];
  } else {
    const factor = TIER_FLOOR_FACTOR[tier];
    const band = FLOOR_BAND[type];
    lo = Math.round(band[0] * factor);
    hi = Math.round(band[1] * factor);
    floorHeight = FLOOR_HEIGHT[type];
  }
  const cap = Math.max(1, Math.min(hi, districtMaxFloors));
  const floor = Math.max(1, Math.min(lo, cap));
  const maxFloors = Math.max(floor, Math.min(cap, floor + rng.int(0, Math.max(0, cap - floor))));
  const minFloors = Math.max(1, Math.round(floor + (maxFloors - floor) * 0.3));
  return {
    minFloors,
    maxFloors,
    floorHeight,
    maxHeight: Math.round(maxFloors * floorHeight * 100) / 100,
  };
}
