/**
 * Signal phases at controlled junctions.
 *
 * A junction with three or more grade arms that carry cars, one of them an
 * avenue, alternates two phases. Arms within 45 degrees of the first arm's axis
 * share one phase; the rest take the other. A crossing spans one arm, so the
 * people on it walk alongside the other phase's arms and move with them.
 */
import type { CrossingLink, SignalGroup } from '../../schema/architecture';
import type { StreetNode, Vec2 } from '../../schema/blueprint';
import { dot } from '../geom/vec';
import { approach } from './Approaches';
import type { PlannedEdge } from './PlannedEdge';

const AXIS_COS = Math.cos(Math.PI / 4);

export class Signals {
  /** Phases at one node. Sets `signalGroupId` on each crossing a phase releases. */
  static of(node: StreetNode, edges: ReadonlyMap<string, PlannedEdge>, crossings: CrossingLink[]): SignalGroup[] {
    const grade = node.connections.find(group => group.level === 0);
    if (!grade) return [];
    const arms = grade.edgeIds.map(id => approach(edges.get(id)!, node.id))
      .filter(arm => arm.edge.class !== 'highway' && arm.edge.lanes.length > 0);
    if (arms.length < 3 || !arms.some(arm => arm.edge.class === 'road')) return [];
    const axis = arms[0].inbound;
    const phase = (inbound: Vec2): 0 | 1 => (Math.abs(dot(axis, inbound)) >= AXIS_COS ? 0 : 1);
    const groups: SignalGroup[] = [0, 1].map(index => ({ id: `${node.id}.g${index}`, nodeId: node.id, laneIds: [], crossingIds: [] }));
    for (const arm of arms) groups[phase(arm.inbound)].laneIds.push(...arm.arriving.map(lane => lane.id));
    if (groups.some(group => group.laneIds.length === 0)) return [];
    for (const crossing of crossings) {
      const arm = arms.find(candidate => candidate.edge.id === crossing.edgeId);
      if (!arm) continue;
      const group = groups[1 - phase(arm.inbound)];
      group.crossingIds.push(crossing.id);
      crossing.signalGroupId = group.id;
    }
    return groups;
  }
}
