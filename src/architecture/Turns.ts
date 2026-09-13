/**
 * Which turns a driver may take at a node.
 *
 * A movement exists only if it is listed: Engine routes on this list and the
 * streets box paints arrows from it. Pairs never cross elevation groups, so a
 * street at grade cannot feed a deck passing overhead.
 */
import type { DrivingLane, TurnKind, TurnMovement } from '../../schema/architecture';
import type { StreetConnection, Vec2 } from '../../schema/blueprint';
import type { PlannedEdge } from './PlannedEdge';
import { cross, dot } from '../geom/vec';
import { approach, type Approach } from './Approaches';

/** Within 30 degrees of straight on is a through movement; within 30 of a reversal is a u-turn. */
const STRAIGHT_COS = Math.cos(Math.PI / 6);

export class Turns {
  /**
   * Legal movements at one node, for every elevation group it publishes.
   * Each arriving lane keeps its rank from the kerb through a straight on
   * movement; a turn is taken from the lane on that side of the carriageway and
   * enters the lane on the same side of the new one, which is how a driver
   * reads a real junction.
   */
  static of(nodeId: string, connections: readonly StreetConnection[], edges: ReadonlyMap<string, PlannedEdge>): TurnMovement[] {
    const out: TurnMovement[] = [];
    for (const group of connections) {
      const arms = group.edgeIds.map(id => approach(edges.get(id)!, nodeId));
      for (const from of arms) {
        for (const to of arms) {
          const kind = classify(from.inbound, to.outbound);
          if (from.edge.id === to.edge.id) {
            if (kind !== 'u-turn' || !turnsAround(group)) continue;
          } else if (kind === 'u-turn') {
            continue;
          }
          for (const [fromLane, toLane] of pairs(kind, from, to)) {
            out.push({ fromLaneId: fromLane.id, toLaneId: toLane.id, kind, level: group.level });
          }
        }
      }
    }
    return out.sort((a, b) => a.fromLaneId.localeCompare(b.fromLaneId) || a.toLaneId.localeCompare(b.toLaneId));
  }
}

/**
 * A dead end is where turning around is the only way back, and a junction of
 * three or more arms has room for it. Mid block, between two arms, it is not a
 * manoeuvre: the driver is simply on the wrong side of the road.
 */
function turnsAround(group: StreetConnection): boolean {
  return group.edgeIds.length === 1 || group.edgeIds.length >= 3;
}

function classify(inbound: Vec2, outbound: Vec2): TurnKind {
  const forward = dot(inbound, outbound);
  if (forward >= STRAIGHT_COS) return 'through';
  if (forward <= -STRAIGHT_COS) return 'u-turn';
  return cross(inbound, outbound) > 0 ? 'left' : 'right';
}

/** Which lane feeds which, for one pair of arms and one kind of movement. */
function pairs(kind: TurnKind, from: Approach, to: Approach): [DrivingLane, DrivingLane][] {
  const arriving = from.arriving;
  const departing = to.departing;
  if (arriving.length === 0 || departing.length === 0) return [];
  if (kind === 'right') return [[arriving[arriving.length - 1], departing[departing.length - 1]]];
  if (kind === 'left' || kind === 'u-turn') return [[arriving[0], departing[0]]];
  // Straight on: keep your rank from the kerb, and merge inwards where the far
  // side is narrower.
  return arriving.map((lane, index) => {
    const rankFromKerb = arriving.length - 1 - index;
    return [lane, departing[departing.length - 1 - Math.min(rankFromKerb, departing.length - 1)]];
  });
}
