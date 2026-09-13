/**
 * One arm of a junction, seen from the junction.
 *
 * Everything about a turn, a signal phase and a crossing is easier to state
 * from the driver's seat than from the edge's own direction, so this is the one
 * place that converts between the two. A lane list here always runs from the
 * driver's left to the driver's right.
 */
import type { DrivingLane } from '../../schema/architecture';
import type { Vec2 } from '../../schema/blueprint';
import type { PlannedEdge } from './PlannedEdge';
import { normalize, sub } from '../geom/vec';

export interface Approach {
  edge: PlannedEdge;
  /** Which end of the edge meets the node. */
  end: 'from' | 'to';
  /** Height where this arm meets the node: the level of its endpoint knot. */
  level: number;
  /** Unit direction a car travels while arriving at the node. */
  inbound: Vec2;
  /** Unit direction a car travels while leaving the node. */
  outbound: Vec2;
  /** Lanes whose travel ends here, driver's left to driver's right. */
  arriving: DrivingLane[];
  /** Lanes whose travel starts here, driver's left to driver's right. */
  departing: DrivingLane[];
}

/** The arm one edge forms at one of its nodes. */
export function approach(edge: PlannedEdge, nodeId: string): Approach {
  const end = edge.to === nodeId ? 'to' : 'from';
  const knots = edge.elevationProfile;
  const level = end === 'to' ? knots[knots.length - 1].level : knots[0].level;
  const along = end === 'to'
    ? normalize(sub(edge.path[edge.path.length - 1], edge.path[edge.path.length - 2]))
    : normalize(sub(edge.path[0], edge.path[1]));
  // Arriving at `to` runs along the path; arriving at `from` runs against it.
  const arrivingDirection = end === 'to' ? 'forward' : 'backward';
  return {
    edge,
    end,
    level,
    inbound: along,
    outbound: [-along[0], -along[1]],
    arriving: driverOrder(edge.lanes.filter(lane => lane.direction === arrivingDirection), end === 'to'),
    departing: driverOrder(edge.lanes.filter(lane => lane.direction !== arrivingDirection), end === 'from'),
  };
}

/**
 * A driver facing along the edge path has the edge's left on their left, so
 * lanes run left to right as offsets fall. Facing the other way reverses it.
 */
function driverOrder(lanes: DrivingLane[], facesAlongPath: boolean): DrivingLane[] {
  return [...lanes].sort((a, b) => facesAlongPath ? b.offset - a.offset : a.offset - b.offset);
}
