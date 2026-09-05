import type {
  ElevationPoint, HighwaySupport, Polygon, Polyline, StreetEdge, Vec2,
} from '../../../../schema/blueprint';
import type { HighwayEnvelope } from '../highway';
import type { CorridorBandRole } from '../corridors/schema';

export type DatumStructureEnvelope = HighwayEnvelope;

export interface GradeDatumInput {
  boundary: Polygon;
  edges: StreetEdge[];
  structures: DatumStructureEnvelope[];
  roadwayTop: number;
  pedestrianTop: number;
  /** Explicit opt-in to source-owned side roles. Omission accepts curb-only sides. */
  groundFormat?: 'side-bands-v1';
}

export type DatumPhysicalInput = Pick<GradeDatumInput, 'boundary' | 'edges' | 'structures'>;
export type DatumRoadwayInput = Pick<GradeDatumInput, 'boundary' | 'roadwayTop'> & { edges: readonly StreetEdge[] };

export interface DatumStation {
  distance: number;
  point: Vec2;
  tangent: Vec2;
  level: number;
}

export interface DatumSpan {
  id: string;
  edgeId: string;
  start: DatumStation;
  end: DatumStation;
  path: Polyline;
  /** Classification of the positive-length span interior. */
  elevation: 'at-grade' | 'off-grade';
}

export interface DatumRoadwayOwner {
  spanId: string;
  polygons: Polygon[];
}

export interface DatumRoadwayPlan {
  spans: DatumSpan[];
  roadway: DatumRoadwayOwner[];
}

export interface DatumPedestrianOwner extends DatumRoadwayOwner {
  side: 'left' | 'right';
}

export interface DatumSideBand {
  edgeId: string;
  /** All positive source spans, in station order; the complete edge is flat at the datum. */
  spanIds: string[];
  side: 'left' | 'right';
  role: CorridorBandRole;
  /** Absolute surface top in metres, including the roadway datum. */
  top: number;
  /** Complete edge-local query masks, unchanged and contained in the city domain. */
  masks: Polygon[];
}

export interface DatumPhysicalOwner {
  kind: 'deck';
  edgeId: string;
  spanIds: string[];
  path: Polyline;
  width: number;
  polygons: Polygon[];
  /** Heights follow the source edge's arc-distance coordinates. */
  undersideProfile: ElevationPoint[];
  topProfile: ElevationPoint[];
}

export interface DatumPhysicalPlan {
  boundary: Polygon;
  physical: Omit<DatumPhysicalOwner, 'spanIds'>[];
  projected: { structures: { edgeIds: string[] }[] };
}

export interface GradeDatumPlan {
  boundary: Polygon;
  spans: DatumSpan[];
  groundFormat?: 'side-bands-v1';
  grade: {
    roadway: DatumRoadwayOwner[];
    pedestrian: DatumPedestrianOwner[];
    /** Inclusive source corridors; final roadway/curb claims take precedence. */
    corridors: DatumRoadwayOwner[];
    /** Present only for the opted-in format. Explicit sides do not also own pedestrian rows. */
    sideBands?: DatumSideBand[];
    full: Polygon[];
  };
  projected: {
    edges: { edgeId: string; polygons: Polygon[] }[];
    /** Complete structural footprint; the root applies building clearance. */
    structures: { edgeIds: string[]; polygons: Polygon[] }[];
  };
  physical: DatumPhysicalOwner[];
  /** Clipped planar faces; this classification does not grant building eligibility. */
  land: ({
    id: string;
    /** Hole partitions and clipped components retain their source-face identity. */
    polygons: Polygon[];
  } & ({
    kind: 'street-enclosed';
    /** Bounded centerline face area before road subtraction or city clipping. */
    enclosedArea: number;
  } | { kind: 'outer-fringe' }))[];
  roadFrontage: {
    landId: string;
    spanIds: string[];
    kind: 'road-edge' | 'elevation-transition';
    path: Polyline;
  }[];
}

export interface DatumClearanceInput {
  plan: DatumPhysicalPlan;
  /** Supplied after support placement against the completed grade ground. */
  supports: { structureEdgeIds: string[]; support: HighwaySupport }[];
  groundTop: number;
  clearHeight: number;
}

export interface DatumClearanceRegion {
  source: { kind: 'deck'; physicalOwnerIndex: number }
    | { kind: 'support'; supportIndex: number };
  polygons: Polygon[];
}
