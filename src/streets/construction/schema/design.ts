import type { DistrictKind } from '../../../../schema/params';

/** Numeric street construction settings, independent of material catalogs. */
export interface LaneDesign {
  direction: 'forward' | 'backward';
  width: number;
}

export interface RoadProfile {
  id: string;
  classes: ('street' | 'road')[];
  /** Ordered left to right across the directed path. */
  lanes: LaneDesign[];
  shoulders: { left: number; right: number };
}

export interface SidewalkBands {
  curb: number;
  border: number;
  furnishing: number;
  walking: number;
  frontage: number;
}

export interface SidewalkProfile extends SidewalkBands {
  id: string;
}

export interface StreetDesign {
  profiles: RoadProfile[];
  sidewalkProfiles: SidewalkProfile[];
  /** Each directed side selects its district's profile independently. */
  sidewalkAssignments?: { district: DistrictKind; street?: string; road?: string }[];
  /** Required vertical space above a pedestrian crossing, in metres. */
  crossings?: { pedestrianClearance: number };
}
