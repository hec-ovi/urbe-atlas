/**
 * Extracts city blocks as interior faces of the planar street graph
 * via the rightmost-turn half-edge walk.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import { angleOf, dist, sub } from '../geom/vec';
import { area, signedArea } from '../geom/polygon';
import type { BuiltEdge } from './Graph';

export interface Face {
  polygon: Polygon;
  edgeIds: string[];
}

interface HalfEdge {
  edge: BuiltEdge;
  forward: boolean; // true: from -> to
  tail: string;
  head: string;
  outAngle: number; // direction leaving tail
}

export class FaceExtractor {
  static faces(edges: BuiltEdge[], minArea: number, maxArea: number): Face[] {
    const halves: HalfEdge[] = [];
    for (const edge of edges) {
      const p = edge.path;
      halves.push({
        edge,
        forward: true,
        tail: edge.from,
        head: edge.to,
        outAngle: angleOf(sub(p[1], p[0])),
      });
      halves.push({
        edge,
        forward: false,
        tail: edge.to,
        head: edge.from,
        outAngle: angleOf(sub(p[p.length - 2], p[p.length - 1])),
      });
    }

    const outgoing = new Map<string, HalfEdge[]>();
    for (const h of halves) {
      const list = outgoing.get(h.tail);
      if (list) list.push(h);
      else outgoing.set(h.tail, [h]);
    }
    for (const list of outgoing.values()) {
      list.sort((a, b) => a.outAngle - b.outAngle || a.edge.id.localeCompare(b.edge.id));
    }

    const nextHalf = (h: HalfEdge): HalfEdge => {
      const list = outgoing.get(h.head)!;
      let idx = -1;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.edge.id === h.edge.id && c.forward === !h.forward) {
          idx = i;
          break;
        }
      }
      // rightmost turn: next clockwise from the reverse half-edge
      return list[(idx - 1 + list.length) % list.length];
    };

    const visited = new Set<string>();
    const keyOf = (h: HalfEdge): string => `${h.edge.id}:${h.forward ? 'f' : 'b'}`;
    const faces: Face[] = [];

    for (const start of halves) {
      if (visited.has(keyOf(start))) continue;
      const polygon: Vec2[] = [];
      const edgeIds: string[] = [];
      let h = start;
      let guard = 0;
      let closed = false;
      while (guard++ < 10000) {
        visited.add(keyOf(h));
        edgeIds.push(h.edge.id);
        const path = h.forward ? h.edge.path : [...h.edge.path].reverse();
        for (let i = 0; i < path.length - 1; i++) polygon.push(path[i]);
        h = nextHalf(h);
        if (h.edge.id === start.edge.id && h.forward === start.forward) {
          closed = true;
          break;
        }
        if (visited.has(keyOf(h))) break;
      }
      if (!closed || polygon.length < 3) continue;
      const cleaned = removeSpurs(polygon);
      if (cleaned.length < 3) continue;
      if (signedArea(cleaned) <= 0) continue; // outer face or degenerate
      const a = area(cleaned);
      if (a < minArea || a > maxArea) continue;
      faces.push({ polygon: cleaned, edgeIds: [...new Set(edgeIds)] });
    }

    return faces;
  }
}

/** Remove zero-width spurs (A,B,A patterns) and consecutive duplicates. */
function removeSpurs(polygon: Vec2[]): Vec2[] {
  let pts = polygon.slice();
  let changed = true;
  while (changed && pts.length >= 3) {
    changed = false;
    const out: Vec2[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const cur = pts[i];
      const next = pts[(i + 1) % n];
      if (dist(cur, next) < 1e-6) {
        changed = true;
        continue;
      }
      if (dist(prev, next) < 1e-6) {
        changed = true;
        continue;
      }
      out.push(cur);
    }
    pts = out;
  }
  return pts;
}
