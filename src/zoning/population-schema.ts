import type { DistrictKind, WealthTier } from '../../schema/params';

export interface DistrictCapacityInput {
  districtId: string;
  kind: DistrictKind;
  tier: WealthTier;
  maxFloors: number;
  /** Net land available after streets, water and existing infrastructure, before lots. */
  landArea: number;
}

export interface PopulationForecast {
  /** Pre-parcel capacity for infrastructure planning, separate from final resident statistics. */
  populationEstimate: number;
  districts: {
    districtId: string;
    residentialArea: number;
    meanResidentialFloors: number;
    populationEstimate: number;
  }[];
}
