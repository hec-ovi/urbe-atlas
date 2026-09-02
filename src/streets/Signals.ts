/**
 * Traffic signals. A junction where three or more streets meet at grade and at
 * least one is a road is signalled, and then every one of its arms gets a
 * head. A highway is a deck passing over the junction and an alley carries no
 * vehicle, so neither counts as an arm and neither takes one. The pole
 * stands on the kerb the approach keeps to (right-hand traffic), the head
 * looks back down the arm at the drivers it stops, and the mast reaches from
 * the pole across the approach lanes to the roadway centerline.
 */
import type { StreetEdge, StreetNode, TrafficSignal, Vec2 } from '../../schema/blueprint';
import { length as lineLength, directionAt, distanceTo, pointAt } from '../geom/polyline';
import { approachSetback } from './Crossings';
import { CURB_WIDTH } from './widths';

/**
 * Arms that meet at grade with a carriageway to stop. A highway is a deck
 * passing overhead and an alley carries no vehicle, so neither makes a
 * junction of traffic and neither takes a head.
 */
const SIGNALLED = new Set(['street', 'road']);
/** A junction is signalled only when one of its arms is at least this heavy. */
const TRIGGERS = new Set(['road']);
/** How far a pole may read off its own band, meters: the 1 mm grid and a bend. */
const BAND_SLACK = 0.5;

export class Signals {
  static build(nodes: readonly StreetNode[], edges: readonly StreetEdge[]): TrafficSignal[] {
    const edgeById = new Map(edges.map((e) => [e.id, e]));
    const out: TrafficSignal[] = [];
    for (const node of nodes) {
      const arms = node.edgeIds
        .map((id) => edgeById.get(id))
        .filter((e): e is StreetEdge => e !== undefined && SIGNALLED.has(e.class));
      if (arms.length < 3 || !arms.some((e) => TRIGGERS.has(e.class))) continue;
      // a junction is signalled whole or not at all: one head on every arm
      const heads = arms.map((edge) => headOn(node, edge));
      if (heads.some((h) => h === null)) continue;
      out.push(...(heads as TrafficSignal[]));
    }
    return out;
  }
}

function headOn(node: StreetNode, edge: StreetEdge): TrafficSignal | null {
  const armLength = lineLength(edge.path);
  const back = approachSetback(edge.width, armLength);
  const atStart = edge.from === node.id;
  const arc = atStart ? back : armLength - back;
  if (arc <= 0 || arc >= armLength) return null;

  const along = directionAt(edge.path, arc);
  // the direction the traffic this head stops is travelling: toward the junction
  const toward: Vec2 = atStart ? [-along[0], -along[1]] : along;
  const right: Vec2 = [toward[1], -toward[0]];
  // the kerb the approach keeps to is the path's left when the arm leaves the node, its right when it arrives
  const sidewalk = atStart ? edge.sidewalk.left : edge.sidewalk.right;
  const reach = edge.width / 2 + CURB_WIDTH + sidewalk / 2;
  const base = pointAt(edge.path, arc);
  const position: Vec2 = [base[0] + right[0] * reach, base[1] + right[1] * reach];
  // a tight bend pinches the offset line back toward the roadway: verify the pole on its own edge
  const off = distanceTo(edge.path, position);
  if (off < edge.width / 2 - BAND_SLACK || off > edge.width / 2 + sidewalk + BAND_SLACK) return null;
  return {
    nodeId: node.id,
    edgeId: edge.id,
    position,
    facing: [-toward[0], -toward[1]],
    mast: { direction: [-right[0], -right[1]], length: reach },
  };
}
