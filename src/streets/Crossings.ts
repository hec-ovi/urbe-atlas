/**
 * Pedestrian crossings: at every intersection, one segment across each
 * sidewalked arm, linking the sidewalks on both sides of that roadway.
 */
import type { Crossing, Polygon, Vec2 } from '../../schema/blueprint';
import type { BuiltEdge, BuiltNode } from './Graph';
import { length as lineLength, offsetAt } from '../geom/polyline';
import { carriagewayWidth } from './widths';
import { add, dist, normalize, perp, scale, sub } from '../geom/vec';
import { snapPoint } from '../geom/clip';

/** Crossing construction dimensions in meters. */
export const CROSSING = {
  width: 3,
  stripeLength: 0.5,
  stripeGap: 0.5,
} as const;

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
        const roadwayFrom = offsetAt(edge.path, arc, w / 2);
        const roadwayTo = offsetAt(edge.path, arc, -w / 2);
        segments.push({
          edgeId,
          from: offsetAt(edge.path, arc, side),
          to: offsetAt(edge.path, arc, -side),
          width: CROSSING.width,
          markings: zebraMarkings(roadwayFrom, roadwayTo),
        });
      }
      if (segments.length > 0) out.push({ nodeId: node.id, segments });
    }
    return out;
  }
}

/** Equal whole stripes centered inside the carriageway, with no cropped end stripe. */
function zebraMarkings(from: Vec2, to: Vec2): Polygon[] {
  const span = dist(from, to);
  if (span <= 1e-6) return [];
  const direction = normalize(sub(to, from));
  const across = perp(direction);
  const pitch = CROSSING.stripeLength + CROSSING.stripeGap;
  const count = Math.max(1, Math.floor((CROSSING.width + CROSSING.stripeGap) / pitch));
  const occupied = count * CROSSING.stripeLength + (count - 1) * CROSSING.stripeGap;
  const first = -occupied / 2 + CROSSING.stripeLength / 2;
  const u = scale(direction, span / 2);
  const v = scale(across, CROSSING.stripeLength / 2);
  const middle = scale(add(from, to), 0.5);
  return Array.from({ length: count }, (_, index) => {
    const center = add(middle, scale(across, first + index * pitch));
    return [
      snapPoint(sub(sub(center, u), v)),
      snapPoint(add(sub(center, v), u)),
      snapPoint(add(add(center, u), v)),
      snapPoint(sub(add(center, v), u)),
    ];
  });
}
