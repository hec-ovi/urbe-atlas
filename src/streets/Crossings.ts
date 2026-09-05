/**
 * Pedestrian crossings: at every intersection, one segment across each
 * sidewalked arm, linking the sidewalks on both sides of that roadway.
 */
import type { Crossing, Polygon, StreetEdge, Vec2 } from '../../schema/blueprint';
import type { BuiltNode } from './Graph';
import { length as lineLength, offsetAt } from '../geom/polyline';
import { sidewalkBand } from './construction/SidewalkSection';
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
  static build(nodes: BuiltNode[], edges: StreetEdge[]): Crossing[] {
    const edgeById = new Map(edges.map((e) => [e.id, e]));
    const out: Crossing[] = [];
    for (const node of nodes) {
      if (node.edgeIds.length < 2) continue;
      const segments: Crossing['segments'] = [];
      const junctionWidth = Math.max(...node.edgeIds.map((id) => edgeById.get(id)!)
        .filter((edge) => edge.class !== 'highway').map((edge) => edge.width));
      for (const edgeId of node.edgeIds) {
        const edge = edgeById.get(edgeId)!;
        if (edge.sidewalk.left <= 0 || edge.sidewalk.right <= 0 || edge.width <= 0) continue;
        const w = edge.width;
        const l = lineLength(edge.path);
        const back = approachSetback(junctionWidth, l);
        const arc = edge.from === node.id ? back : l - back;
        const roadwayFrom = offsetAt(edge.path, arc, w / 2);
        const roadwayTo = offsetAt(edge.path, arc, -w / 2);
        segments.push({
          edgeId,
          from: offsetAt(edge.path, arc, w / 2 + sidewalkBand(edge, 'left', 'walking').offset),
          to: offsetAt(edge.path, arc, -(w / 2 + sidewalkBand(edge, 'right', 'walking').offset)),
          roadway: { from: roadwayFrom, to: roadwayTo },
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
