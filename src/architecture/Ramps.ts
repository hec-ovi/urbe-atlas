/**
 * Climbs between grade and an elevated deck, read from the highway structures.
 *
 * A structure rises over `ramps.start` metres from its path start and falls
 * over `ramps.end` metres to its path end. Each open end is one ramp; its
 * stretches run from the foot to the head, in the direction of the climb.
 */
import type { Ramp, RampStretch } from '../../schema/architecture';
import type { HighwayStructure, StreetEdge, Vec2 } from '../../schema/blueprint';
import { length as pathLength } from '../geom/polyline';

/** One structure edge placed along the structure path. */
interface Piece {
  edge: StreetEdge;
  start: number;
  end: number;
  /** The edge's own path runs with the structure path. */
  forward: boolean;
}

const gap = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

export class Ramps {
  static of(structures: readonly HighwayStructure[], edges: ReadonlyMap<string, StreetEdge>): Ramp[] {
    const out: Ramp[] = [];
    for (const structure of structures) {
      const pieces = Ramps.pieces(structure, edges);
      const total = pieces.at(-1)?.end ?? 0;
      const deck = pieces.filter(piece => piece.end > structure.ramps.start && piece.start < total - structure.ramps.end)
        .map(piece => piece.edge.id);
      const head = structure.level;
      if (structure.ramps.start > 0) {
        out.push(Ramps.climb(`rp${out.length}`, pieces, 0, structure.ramps.start, structure.elevationProfile[0].level, head, deck));
      }
      if (structure.ramps.end > 0) {
        out.push(Ramps.climb(`rp${out.length}`, pieces, total, total - structure.ramps.end,
          structure.elevationProfile.at(-1)!.level, head, deck));
      }
    }
    return out;
  }

  private static pieces(structure: HighwayStructure, edges: ReadonlyMap<string, StreetEdge>): Piece[] {
    let cursor = structure.path[0];
    let at = 0;
    return structure.edgeIds.map(id => {
      const edge = edges.get(id)!;
      const forward = gap(edge.path[0], cursor) <= gap(edge.path.at(-1)!, cursor);
      cursor = forward ? edge.path.at(-1)! : edge.path[0];
      const length = pathLength(edge.path);
      const piece = { edge, start: at, end: at + length, forward };
      at += length;
      return piece;
    });
  }

  /** One climb from structure distance `foot` to `head`, either direction along the path. */
  private static climb(id: string, pieces: Piece[], foot: number, top: number, footLevel: number, headLevel: number,
    deckEdgeIds: string[]): Ramp {
    const low = Math.min(foot, top), high = Math.max(foot, top);
    const ordered = foot < top ? pieces : [...pieces].reverse();
    const local = (piece: Piece, distance: number): number => (piece.forward ? distance - piece.start : piece.end - distance);
    const stretches: RampStretch[] = ordered
      .filter(piece => piece.end > low && piece.start < high)
      .map(piece => {
        const a = Math.max(piece.start, low), b = Math.min(piece.end, high);
        const [near, far] = foot < top ? [a, b] : [b, a];
        return { edgeId: piece.edge.id, from: local(piece, near), to: local(piece, far) };
      });
    const first = ordered.find(piece => piece.end > low && piece.start < high)!;
    const atStart = foot < top;
    const gradeNodeId = atStart === first.forward ? first.edge.from : first.edge.to;
    return { id, gradeNodeId, stretches, foot: footLevel, head: headLevel, length: high - low, deckEdgeIds };
  }
}
