/** Preview palette: hue per parcel type, tier scales light (poor) to strong (high rich). */
import type { ParcelType, StreetClass } from '../../../schema/blueprint';
import type { WealthTier } from '../../../schema/params';

const TYPE_HUE: Record<ParcelType, [h: number, s: number]> = {
  residential: [211, 85],
  hotel: [280, 60],
  offices: [262, 70],
  corpo: [291, 85],
  hospital: [0, 75],
  clinic: [14, 70],
  police: [225, 45],
  military: [84, 25],
  factory: [30, 25],
  commerce: [33, 90],
  mall: [45, 95],
  restaurant: [8, 85],
  coffee_shop: [25, 65],
};

const TIER_LIGHT: Record<WealthTier, number> = {
  poor: 82,
  mid: 66,
  rich: 50,
  high_rich: 36,
};

/** Hue, saturation and lightness of a parcel's colour, each on its usual scale. */
export function parcelHsl(type: ParcelType, tier: WealthTier): [h: number, s: number, l: number] {
  const [h, s] = TYPE_HUE[type];
  return [h, s, TIER_LIGHT[tier]];
}

export function parcelColor(type: ParcelType, tier: WealthTier): string {
  const [h, s, l] = parcelHsl(type, tier);
  return `hsl(${h} ${s}% ${l}%)`;
}

export function streetColor(cls: StreetClass): string {
  switch (cls) {
    case 'highway':
      return '#3a3f47';
    case 'road':
      return '#565d66';
    case 'street':
      return '#767d86';
    case 'alley':
      return '#a98b62';
  }
}

export const GROUND_COLORS = {
  roadway: '#565d66',
  sidewalk: '#b9bec4',
  block: '#e6e2d8',
  open: '#cfe0c3',
} as const;

export const TRANSIT_COLORS = {
  busStop: '#0b7f3b',
  busRoute: '#0b7f3b',
  subway: '#d0021b',
  subwayStation: '#8b0012',
  train: '#1a1a1a',
  trainStation: '#000000',
} as const;

export const DISTRICT_OUTLINE = '#222222';
export const BOUNDARY_COLOR = '#101418';
