/** Local mirror of Exterior's published hard minima and generation policy. */
import type { BuildingParcelType } from '../../schema/blueprint';

export const FLOOR_GENERATION_POLICY = {
  defaultClearHeight: 4,
  clearHeightAllowance: 0.5,
  defaultFloorHeight: 4.5,
} as const;

type Family = 'residential' | 'hotel' | 'office' | 'corpo' | 'hospital' | 'security' | 'industrial' | 'commerce';

const FAMILY: Record<BuildingParcelType, Family> = {
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
export function minFloorHeight(type: BuildingParcelType): number {
  return MIN_FLOOR_HEIGHT[FAMILY[type]];
}

/** Generation pitch for the requested clear room height and slab/ceiling allowance. */
export function activeMinFloorHeight(type: BuildingParcelType): number {
  return Math.max(minFloorHeight(type), FLOOR_GENERATION_POLICY.defaultClearHeight + FLOOR_GENERATION_POLICY.clearHeightAllowance);
}
