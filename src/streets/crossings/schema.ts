import type { Crossing, GroundSurface, Polygon, StreetEdge, StreetNode, Vec2 } from '../../../schema/blueprint';
import type { StreetPlanningReservations } from '../construction/corridors/schema';
import type { PartitionEdgeMask } from '../../geom/partition/schema';

/** Exact affine construction from authored 1 mm source-long support edges. */
export interface CrossingConstruction {
  field: PartitionEdgeMask;
  landings: { left: PartitionEdgeMask; right: PartitionEdgeMask };
  walkingLandings: { left: PartitionEdgeMask; right: PartitionEdgeMask };
}

/** Original graph identities remain attached to every physical approach. */
export interface JunctionApproach {
  groupId: string;
  nodeId: string;
  edgeId: string;
  /** Crossing centre measured along the edge's directed path, metres. */
  distance: number;
  /** Complete field interval along the directed edge, lower then upper station. */
  station: [number, number];
  /** Full marked carriageway field, width along the road. */
  field: Polygon;
  /** Crossing-only connectors, including any unmarked road margin before the curb. */
  landings: { left: Polygon; right: Polygon };
  /** Source-directed quads: low lateral at low/high station, then high lateral at high/low station.
   * Exterior boundary is [1]-[2] at edge.from and [0]-[3] at edge.to. */
  walkingLandings: { left: Polygon; right: Polygon };
  /** Junction-facing field boundary; sides still follow the directed edge. */
  cut: { left: Vec2; right: Vec2 };
}

/** A physical contact domain connected only through original graph edges. */
export interface CrossingJunction {
  id: string;
  groupIds: string[];
  nodeIds: string[];
  internalEdgeIds: string[];
  approaches: JunctionApproach[];
}

export interface CrossingSourceInput {
  nodes: readonly StreetNode[];
  edges: readonly StreetEdge[];
  reservations: StreetPlanningReservations;
  /** One entry per positive-width edge with a flat grade span; clipped-empty sources retain an empty list. */
  gradeRoadway?: readonly { edgeId: string; polygons: Polygon[] }[];
}

export interface SourceContactGroup {
  id: string;
  nodeId: string;
  pedestrianEdgeIds: string[];
  trafficEdgeIds: string[];
  /** This original group creates junction demand, independently of final ground. */
  junction: boolean;
}

export interface SourceContactArm {
  groupId: string;
  nodeId: string;
  edgeId: string;
  end: 'from' | 'to';
  /** This external arm requires a marking when final ground planning succeeds. */
  crossing: boolean;
}

/** Source topology only, with no spatial envelope or construction cuts. */
export interface SourceContactDomain {
  /** First original group ID in the resolved component. */
  id: string;
  groups: SourceContactGroup[];
  internalEdgeIds: string[];
  arms: SourceContactArm[];
}

export interface SourceContactPlan {
  domains: SourceContactDomain[];
}

export interface CrossingInput extends CrossingSourceInput {
  ground: readonly GroundSurface[];
  /** Physical solids intersecting the caller's pedestrian clearance interval. */
  obstacles?: readonly Polygon[];
}

export interface JunctionCrossing extends Crossing {
  junctionId: string;
}

export interface CrossingPlan {
  crossings: JunctionCrossing[];
  junctions: CrossingJunction[];
}

/** Root-compatible input; validation requires each marking's junction reference. */
export interface CrossingValidationPlan extends Omit<CrossingPlan, 'crossings'> {
  crossings: (Crossing & { junctionId?: string })[];
}
