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
  poor: 36,
  mid: 48,
  rich: 60,
  high_rich: 72,
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
      return '#505963';
    case 'road':
      return '#384653';
    case 'street':
      return '#465867';
    case 'alley':
      return '#c08b5a';
  }
}

export const GROUND_COLORS = {
  roadway: '#1e2935',
  curb: '#c6d3de',
  sidewalk: '#5c6e80',
  block: '#14202b',
  open: '#245044',
} as const;

export const FURNITURE_COLORS = {
  signal: '#ff667d',
  tree: '#51d68a',
  pole: '#e6edf3',
  bin: '#9aa8b7',
} as const;

export const TRANSIT_COLORS = {
  busStop: '#66ee93',
  busRoute: '#51d68a',
  subway: '#f472b6',
  subwayStation: '#ffb1d8',
  train: '#59ccff',
  trainStation: '#b8eaff',
} as const;

export const DIAGNOSTIC_COLORS = {
  highwayCenterlines: '#fff26d',
  highwaySupports: '#ff4fd8',
  stationAccess: '#65fff0',
} as const;

export const DISTRICT_OUTLINE = '#c084fc';
export const BOUNDARY_COLOR = '#648199';
