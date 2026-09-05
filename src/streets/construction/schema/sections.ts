import type { Polyline, StreetEdge } from '../../../../schema/blueprint';
import type { LaneDesign, SidewalkBands } from './design';
import type { StreetPlanningReservations } from '../corridors/schema';

export interface StreetCrossSection {
  runId: string;
  profileId: string;
  lanes: (LaneDesign & { offset: number })[];
  shoulders: { left: number; right: number };
  sidewalks: {
    left: { profileId: string; bands: SidewalkBands };
    right: { profileId: string; bands: SidewalkBands };
  };
}

export interface StreetRun {
  id: string;
  profileId: string;
  edges: { edgeId: string; forward: boolean; start: number; end: number }[];
  path: Polyline;
  length: number;
}

export interface StreetConstruction {
  version: '1.0.0';
  runs: StreetRun[];
  /** Exact edge-local planning queries. Final GroundSurface polygons own physical ground. */
  planningReservations?: StreetPlanningReservations;
}

/** The construction consumer subset also accepts pre-construction Atlas artifacts. */
export type SectionedStreetEdge = StreetEdge & { crossSection?: StreetCrossSection };
