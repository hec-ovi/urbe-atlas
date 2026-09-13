/**
 * Where people cross a carriageway.
 *
 * A crossing is a link, not a surface: it names the two walking lanes it joins
 * and where it meets each one. The streets box paints the stripes inside the
 * reservation; Engine walks a person from one end to the other.
 */
import type { CrossingLink } from '../../schema/architecture';
import type { StreetEdge, StreetNode, Vec2 } from '../../schema/blueprint';
import { length as pathLength, offsetAt } from '../geom/polyline';
import { round } from './Centerline';
import type { PlannedEdge } from './PlannedEdge';

/** Clear walking width of every crossing. */
export const CROSSING_WIDTH = 3;

/** Clear space kept between the carriageway being entered and the crossing line. */
const JUNCTION_CLEARANCE = 3;

export class Crossings {
  /**
   * One crossing per junction arm that has a carriageway and walking land on
   * both sides. It stands back far enough to clear the widest carriageway
   * meeting here, and never further than a third of the way along a short arm.
   */
  static of(node: StreetNode, edges: ReadonlyMap<string, PlannedEdge>): CrossingLink[] {
    const arms = node.edgeIds.map(id => edges.get(id)!);
    const widest = Math.max(0, ...arms.filter(edge => edge.class !== 'highway').map(edge => edge.reservation.carriageway));
    const out: CrossingLink[] = [];
    for (const edge of arms) {
      const group = node.connections.find(level => level.edgeIds.includes(edge.id));
      if (!group || group.edgeIds.length < 2) continue;
      if (edge.class === 'highway' || edge.reservation.carriageway <= 0) continue;
      const left = edge.walkingLanes.find(lane => lane.side === 'left' && lane.index === 0);
      const right = edge.walkingLanes.find(lane => lane.side === 'right' && lane.index === 0);
      if (!left || !right) continue;
      const length = pathLength(edge.path);
      const setback = Math.min(widest / 2 + JUNCTION_CLEARANCE, length / 3);
      const station = edge.to === node.id ? length - setback : setback;
      out.push({
        id: `${node.id}.c${out.length}`,
        nodeId: node.id,
        edgeId: edge.id,
        ends: [
          { walkingLaneId: left.id, point: at(edge, station, left.offset) },
          { walkingLaneId: right.id, point: at(edge, station, right.offset) },
        ],
        width: CROSSING_WIDTH,
      });
    }
    return out;
  }
}

function at(edge: StreetEdge, station: number, offset: number): Vec2 {
  const point = offsetAt(edge.path, station, offset);
  return [round(point[0]), round(point[1])];
}
