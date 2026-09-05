import type { Polygon } from '../../../../schema/blueprint';
import type { SidewalkBands } from '../schema/design';

export type CorridorBandRole = keyof SidewalkBands | 'gutter' | 'gutter-lip';

export interface CorridorSweepModel {
  id: 'atlas-directed-corridors';
  version: '1.0.0' | '1.1.0';
  authority: 'edge-local-planning';
  units: 'metres';
  coordinateGrid: number;
  maximumFanStepRadians: number;
  bandOrder: readonly CorridorBandRole[];
  radialOrigin: 'centerline';
  joins: 'shared-shortest-angle-fans';
  stations: 'equal-per-turn';
  caps: 'quarter-fans-per-side';
  bandOperation: 'outer-union-minus-inner-union';
  highwayRoadway: 'kernel-round-buffer';
}

export interface SidePlanningReservation {
  sidewalk: Polygon[];
  walking: Polygon[];
}

export interface ExplicitSidePlanningReservation extends SidePlanningReservation {
  paved: Polygon[];
  /** Walking is stored once in the existing walking query. */
  bands: Record<Exclude<CorridorBandRole, 'walking'>, Polygon[]>;
}

export interface EdgePlanningReservations {
  edgeId: string;
  roadway: Polygon[];
  sides: { left: SidePlanningReservation | ExplicitSidePlanningReservation; right: SidePlanningReservation | ExplicitSidePlanningReservation };
}

export interface StreetPlanningReservations {
  version: '1.0.0' | '1.1.0';
  model: CorridorSweepModel;
  edges: EdgePlanningReservations[];
}
