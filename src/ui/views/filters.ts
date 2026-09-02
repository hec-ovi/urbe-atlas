/**
 * What the visualization shows, one switch per thing: every ground surface,
 * every parcel type, every street class, every transit mode, every piece of
 * street furniture, the district outlines. The flat map reads the coarse
 * groups; the 3D view reads each key.
 */
import type { ParcelType, StreetClass } from '../../../schema/blueprint';

export const GROUND_KEYS = ['roadway', 'curb', 'sidewalk', 'block', 'open'] as const;
export const ZONE_KEYS: ParcelType[] = [
  'residential', 'hotel', 'offices', 'corpo', 'hospital', 'clinic', 'police', 'military',
  'factory', 'commerce', 'mall', 'restaurant', 'coffee_shop',
];
export const STREET_KEYS: StreetClass[] = ['street', 'road', 'highway', 'alley'];
export const TRANSIT_KEYS = ['bus', 'train', 'subway'] as const;
export const FURNITURE_KEYS = ['signal', 'tree', 'pole', 'bin'] as const;
export const DIAGNOSTIC_KEYS = ['highwayCenterlines', 'highwaySupports', 'stationAccess'] as const;

export type FilterKey =
  | `ground.${(typeof GROUND_KEYS)[number]}`
  | `zone.${ParcelType}`
  | `street.${StreetClass}`
  | `transit.${(typeof TRANSIT_KEYS)[number]}`
  | `furniture.${(typeof FURNITURE_KEYS)[number]}`
  | `diagnostic.${(typeof DIAGNOSTIC_KEYS)[number]}`
  | 'districts';

export type Filters = Record<FilterKey, boolean>;

export interface FilterGroup {
  id: string;
  title: string;
  description: string;
  keys: FilterKey[];
  open?: boolean;
}

export const FILTER_GROUPS: FilterGroup[] = [
  { id: 'ground', title: 'Ground surfaces', description: 'Roadway, curb, sidewalk and open space', keys: GROUND_KEYS.map((k) => `ground.${k}` as FilterKey), open: true },
  { id: 'zones', title: 'Building zones', description: 'Parcel use types', keys: ZONE_KEYS.map((k) => `zone.${k}` as FilterKey), open: true },
  { id: 'streets', title: 'Street network', description: 'Street, road, highway and pedestrian alley', keys: STREET_KEYS.map((k) => `street.${k}` as FilterKey), open: true },
  { id: 'diagnostics', title: 'Geometry diagnostics', description: 'Bright overlays for structure inspection', keys: DIAGNOSTIC_KEYS.map((k) => `diagnostic.${k}` as FilterKey), open: true },
  { id: 'transit', title: 'Public transit', description: 'Bus, train and underground subway', keys: TRANSIT_KEYS.map((k) => `transit.${k}` as FilterKey), open: true },
  { id: 'furniture', title: 'Street furniture', description: 'Signals, trees, lights and bins', keys: FURNITURE_KEYS.map((k) => `furniture.${k}` as FilterKey) },
  { id: 'districts', title: 'District boundaries', description: 'Planning area outlines', keys: ['districts'] },
];

export function defaultFilters(): Filters {
  const out = {} as Filters;
  for (const group of FILTER_GROUPS) {
    for (const key of group.keys) {
      out[key] = key !== 'districts' && !key.startsWith('diagnostic.') && !key.startsWith('furniture.');
    }
  }
  return out;
}

/** A label for one switch: the part after the group. */
export function filterLabel(key: FilterKey): string {
  const name = key.includes('.') ? key.slice(key.indexOf('.') + 1) : key;
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
}
