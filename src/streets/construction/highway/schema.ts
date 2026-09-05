import type {
  ElevationPoint, HighwayStructure, Polyline, StreetClass,
} from '../../../../schema/blueprint';

export interface ClassedEdge {
  id: string;
  class: StreetClass;
  from: string;
  to: string;
  path: Polyline;
}

export interface HighwayConstructionEdge extends ClassedEdge {
  width?: number;
  level?: number;
  elevationProfile?: ElevationPoint[];
}

export interface HighwayRun {
  edgeIds: string[];
  path: Polyline;
  rampAtStart: boolean;
  rampAtEnd: boolean;
}

export type HighwayEnvelope = Omit<HighwayStructure, 'supports'>;
