/**
 * The city's navigation and reservation spec.
 *
 * Read it to answer five questions about any street: where a car may drive and
 * which way, where it may turn, where a person walks, where a person crosses,
 * and how a car reaches an elevated deck. Everything here is a dimension, a
 * centerline or a link between two of them. No surface polygon lives in this
 * file: the streets box builds every physical surface inside the reservations
 * published here.
 *
 * Units: metres. 2D points are [x, z]. A positive sideways offset is to the
 * left of the edge's own path direction.
 */

import type { Polyline, Vec2 } from './blueprint';

/**
 * Version of this surface. Consumers gate on `meta.architectureVersion`: a
 * major bump means a field moved or changed meaning.
 */
export const ARCHITECTURE_VERSION = '1.0.0';

/** `forward` travels from an edge's `from` node to its `to` node. */
export type TravelDirection = 'forward' | 'backward';

/**
 * Land held for one corridor, as dimensions. The streets box fits its whole
 * cross section (curb, gutter, paving, frontage) inside these numbers and
 * never changes them.
 */
export interface Reservation {
  /** Every driving lane plus both shoulders. 0 where no car drives, as on an alley. */
  carriageway: number;
  /** Reserved width outside the carriageway, left of the path direction: walking land, curb and gutter together. */
  left: number;
  /** The same, right of the path direction. */
  right: number;
}

/** One driving lane on a street edge. A car follows its centerline in `direction`. */
export interface DrivingLane {
  /** `<edgeId>.v<index>`, for example `e12.v0`. Unique across the city. */
  id: string;
  /** Position across the carriageway, 0 leftmost of the edge's path direction. */
  index: number;
  /** Centerline offset from the edge centerline. Positive is left of the path direction. */
  offset: number;
  width: number;
  direction: TravelDirection;
  /** Lane centerline in world coordinates, ordered in the direction of travel. */
  path: Polyline;
}

/** One walking lane beside a street edge. A person follows its centerline, either way. */
export interface WalkingLane {
  /** `<edgeId>.wl<index>` on the left of the path direction, `<edgeId>.wr<index>` on the right. */
  id: string;
  side: 'left' | 'right';
  /** Position outward from the carriageway, 0 nearest it. */
  index: number;
  /** Centerline offset from the edge centerline. Positive is left of the path direction. */
  offset: number;
  /** Clear walking width. */
  width: number;
  /** Centerline in world coordinates, ordered along the edge's path direction. */
  path: Polyline;
}

/** What a driver does through a junction. */
export type TurnKind = 'through' | 'left' | 'right' | 'u-turn';

/**
 * One legal turn at a node: an arriving lane feeds a departing lane. A movement
 * that is not listed is not permitted. Both lanes are always in the same
 * elevation group, so a street at grade never feeds a deck overhead.
 */
export interface TurnMovement {
  /** Lane whose travel ends at this node. */
  fromLaneId: string;
  /** Lane whose travel starts at this node. */
  toLaneId: string;
  kind: TurnKind;
  /** Elevation of the group both lanes belong to: 0 at grade, 8 on a deck. */
  level: number;
}

/** Where a crossing meets one walking lane. */
export interface CrossingLinkEnd {
  walkingLaneId: string;
  /** Point on that lane's centerline. */
  point: Vec2;
}

/**
 * Where people cross one carriageway. It is a link between two walking lanes,
 * nothing more: the streets box paints it and Engine walks it.
 */
export interface CrossingLink {
  /** `<nodeId>.c<index>`, for example `n7.c0`. */
  id: string;
  nodeId: string;
  /** The arm whose carriageway this crossing spans. */
  edgeId: string;
  /** The two walking lanes it joins, the arm's left side first. */
  ends: [CrossingLinkEnd, CrossingLinkEnd];
  /** Clear walking width, measured along the street. */
  width: number;
  /** Phase that releases it. Absent where the junction is uncontrolled. */
  signalGroupId?: string;
}

/**
 * One signal phase at a junction: everything it lists moves at the same time,
 * and phases at one node alternate. Crossing a street runs across the traffic
 * on the other arms, so a crossing is released with the arms it runs along.
 */
export interface SignalGroup {
  /** `<nodeId>.g<index>`, for example `n7.g0`. */
  id: string;
  nodeId: string;
  /** Arriving lanes released to enter the junction. */
  laneIds: string[];
  /** Crossings released to walk. */
  crossingIds: string[];
}

/** One stretch of a climb, on one edge, in the direction of the climb. */
export interface RampStretch {
  edgeId: string;
  /** Distance along that edge's own path where the climb enters it. */
  from: number;
  /** Distance along that edge's own path where the climb leaves it. `from > to` when the climb runs against the path. */
  to: number;
}

/**
 * One climb between grade and an elevated deck. Its stretches carry lanes in
 * both directions, so the same record serves a car going up and a car coming
 * down: drive `stretches` in order to reach the deck, in reverse to leave it.
 */
export interface Ramp {
  /** `rp<index>`. */
  id: string;
  /** Node at the foot, where the climb meets the rest of the street network. */
  gradeNodeId: string;
  /** Stretches in order from the foot to the head. */
  stretches: RampStretch[];
  /** Level at the foot. */
  foot: number;
  /** Level at the head. */
  head: number;
  /** Length of the climb along the path. */
  length: number;
  /** Deck edges the head feeds. */
  deckEdgeIds: string[];
}

/** Navigation data for one street edge. */
export interface EdgeArchitecture {
  edgeId: string;
  reservation: Reservation;
  /** Driving lanes, left to right across the edge's path direction. Empty on alleys. */
  lanes: DrivingLane[];
  /** Walking lanes on both sides, numbered outward from the carriageway. */
  walkingLanes: WalkingLane[];
}

/** Legal movements at one node. */
export interface NodeArchitecture {
  nodeId: string;
  turns: TurnMovement[];
}

/**
 * The city's movement plan: where cars drive and turn, where people walk and
 * cross, which phases release them, and how a car climbs to a deck. Every id it
 * names exists in `streets`.
 */
export interface Architecture {
  /** Equals ARCHITECTURE_VERSION of the Atlas that wrote it. */
  version: string;
  edges: EdgeArchitecture[];
  nodes: NodeArchitecture[];
  crossings: CrossingLink[];
  signalGroups: SignalGroup[];
  ramps: Ramp[];
}
