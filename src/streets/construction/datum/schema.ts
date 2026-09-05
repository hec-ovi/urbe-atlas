import type {
  ElevationPoint, HighwaySupport, Polygon, Polyline, StreetEdge, Vec2,
} from '../../../../schema/blueprint';
import type { HighwayEnvelope } from '../highway';

export type DatumStructureEnvelope = HighwayEnvelope;

export interface GradeDatumInput {
  boundary: Polygon;
  edges: StreetEdge[];
  structures: DatumStructureEnvelope[];
  roadwayTop: number;
  pedestrianTop: number;
}

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

export interface DatumPedestrianOwner extends DatumRoadwayOwner {
  side: 'left' | 'right';
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

export interface GradeDatumPlan {
  boundary: Polygon;
  spans: DatumSpan[];
  grade: {
    roadway: DatumRoadwayOwner[];
    pedestrian: DatumPedestrianOwner[];
    full: Polygon[];
  };
  projected: {
    edges: { edgeId: string; polygons: Polygon[] }[];
    /** Complete structural footprint; the root applies building clearance. */
    structures: { edgeIds: string[]; polygons: Polygon[] }[];
  };
  physical: DatumPhysicalOwner[];
  /** Clipped planar faces; this classification does not grant building eligibility. */
  land: {
    id: string;
    kind: 'street-enclosed' | 'outer-fringe';
    /** Hole partitions and clipped components retain their source-face identity. */
    polygons: Polygon[];
  }[];
  roadFrontage: {
    landId: string;
    spanIds: string[];
    kind: 'road-edge' | 'elevation-transition';
    path: Polyline;
  }[];
}

export interface DatumClearanceInput {
  plan: GradeDatumPlan;
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
