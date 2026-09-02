/**
 * Pedestrian crossings: at every intersection, one segment across each
 * sidewalked arm, linking the sidewalks on both sides of that roadway.
 */
import type { Crossing } from '../../schema/blueprint';
import type { BuiltEdge, BuiltNode } from './Graph';
import { length as lineLength, offsetAt } from '../geom/polyline';
import { carriagewayWidth } from './widths';

/**
 * How far back from a junction the crossing line, and the signal that governs
 * it, sit on an arm: clear of the roadway it crosses, never past a third of a
 * short arm.
 */
export function approachSetback(carriageway: number, armLength: number): number {
  return Math.min(carriageway / 2 + 3, armLength / 3);
}

export class Crossings {
  static build(nodes: BuiltNode[], edges: BuiltEdge[], sidewalkOf: (edgeId: string) => number): Crossing[] {
    const edgeById = new Map(edges.map((e) => [e.id, e]));
    const out: Crossing[] = [];
    for (const node of nodes) {
      if (node.edgeIds.length < 2) continue;
      const segments: Crossing['segments'] = [];
      for (const edgeId of node.edgeIds) {
        const edge = edgeById.get(edgeId)!;
        const sw = sidewalkOf(edgeId);
        if (sw <= 0) continue;
        if (edge.class === 'alley') continue; // no carriageway to cross
        const w = carriagewayWidth(edge.class);
        const l = lineLength(edge.path);
        const back = approachSetback(w, l);
        const arc = edge.from === node.id ? back : l - back;
        const side = w / 2 + sw / 2;
        segments.push({ from: offsetAt(edge.path, arc, side), to: offsetAt(edge.path, arc, -side) });
      }
      if (segments.length > 0) out.push({ nodeId: node.id, segments });
    }
    return out;
  }
}
