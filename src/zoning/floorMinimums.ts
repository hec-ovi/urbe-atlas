/**
 * Minimum floor height per parcel type, mirrored from exterior's published
 * floor constants (../exterior/schemas/floor-constants.json: its family map
 * plus each family's minFloorHeight). An envelope must admit at least one
 * floor of its family, so a type's nominal floor height never sits below
 * this value. The orchestrator keeps the mirror in sync when exterior bumps.
 */
import type { ParcelType } from '../../schema/blueprint';

type Family = 'residential' | 'hotel' | 'office' | 'corpo' | 'hospital' | 'security' | 'industrial' | 'commerce';

const FAMILY: Record<ParcelType, Family> = {
  residential: 'residential',
  hotel: 'hotel',
  offices: 'office',
  corpo: 'corpo',
  hospital: 'hospital',
  clinic: 'hospital',
  police: 'security',
  military: 'security',
  factory: 'industrial',
  commerce: 'commerce',
  mall: 'commerce',
  restaurant: 'commerce',
  coffee_shop: 'commerce',
};

const MIN_FLOOR_HEIGHT: Record<Family, number> = {
  residential: 2.6,
  hotel: 2.8,
  office: 3.4,
  corpo: 3.6,
  hospital: 3.8,
  security: 3.0,
  industrial: 4.5,
  commerce: 3.0,
};

/** Shortest floor the type's family can build, meters. */
export function minFloorHeight(type: ParcelType): number {
  return MIN_FLOOR_HEIGHT[FAMILY[type]];
}
