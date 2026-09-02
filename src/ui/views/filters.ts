/**
 * What the visualization shows, one switch per thing: every ground surface,
 * every parcel type, every street class, every transit mode, the district
 * outlines. The flat map reads the coarse groups; the 3D view reads each key.
 */
import type { ParcelType, StreetClass } from '../../../schema/blueprint';
import type { Layers } from './MapView';

export const GROUND_KEYS = ['roadway', 'curb', 'sidewalk', 'block', 'open'] as const;
export const ZONE_KEYS: ParcelType[] = [
  'residential', 'hotel', 'offices', 'corpo', 'hospital', 'clinic', 'police', 'military',
  'factory', 'commerce', 'mall', 'restaurant', 'coffee_shop',
];
export const STREET_KEYS: StreetClass[] = ['street', 'road', 'highway', 'alley'];
export const TRANSIT_KEYS = ['bus', 'train', 'subway'] as const;

export type FilterKey =
  | `ground.${(typeof GROUND_KEYS)[number]}`
  | `zone.${ParcelType}`
  | `street.${StreetClass}`
  | `transit.${(typeof TRANSIT_KEYS)[number]}`
  | 'districts';

export type Filters = Record<FilterKey, boolean>;

export const FILTER_GROUPS: { title: string; keys: FilterKey[] }[] = [
  { title: 'Ground', keys: GROUND_KEYS.map((k) => `ground.${k}` as FilterKey) },
  { title: 'Zones', keys: ZONE_KEYS.map((k) => `zone.${k}` as FilterKey) },
  { title: 'Streets', keys: STREET_KEYS.map((k) => `street.${k}` as FilterKey) },
  { title: 'Transit', keys: TRANSIT_KEYS.map((k) => `transit.${k}` as FilterKey) },
  { title: 'Districts', keys: ['districts'] },
];

export function defaultFilters(): Filters {
  const out = {} as Filters;
  for (const group of FILTER_GROUPS) for (const key of group.keys) out[key] = key !== 'districts';
  return out;
}

/** The flat map's coarse layers: a group is on when any of its switches is. */
export function coarseLayers(filters: Filters): Layers {
  const any = (prefix: string) => (Object.keys(filters) as FilterKey[]).some((k) => k.startsWith(prefix) && filters[k]);
  return { ground: any('ground.'), zones: any('zone.'), streets: any('street.'), transit: any('transit.'), districts: filters.districts };
}

/** A label for one switch: the part after the group. */
export function filterLabel(key: FilterKey): string {
  const name = key.includes('.') ? key.slice(key.indexOf('.') + 1) : key;
  return name.replace(/_/g, ' ');
}
