/**
 * Builds the planar street graph from traced streamlines:
 * split at intersections, snap-cluster nodes, prune dangling chains,
 * keep the largest connected component, assign stable sorted ids.
 */
import type { Polyline, StreetClass, Vec2 } from '../../schema/blueprint';
import { segmentIntersection } from '../geom/vec';
import { dist } from '../geom/vec';
import { snapPoint } from '../geom/clip';
import { length as lineLength, simplify } from '../geom/polyline';
import type { TracedLine } from './StreamlineTracer';

export interface BuiltNode {
  id: string;
  position: Vec2;
  edgeIds: string[];
}

export interface BuiltEdge {
  id: string;
  class: StreetClass;
  from: string;
  to: string;
  path: Polyline;
}

const CLASS_RANK: Record<StreetClass, number> = { highway: 0, road: 1, street: 2 };

interface WorkEdge {
  class: StreetClass;
  a: number; // node index
  b: number;
  path: Polyline;
}

export class StreetGraphBuilder {
  static build(
    lines: TracedLine[],
    options: { simplifyTolerance: number; snapRadius: number },
  ): { nodes: BuiltNode[]; edges: BuiltEdge[] } {
    const { snapRadius } = options;
    const polylines = lines
      .map((l) => ({ class: l.class, path: simplify(l.path, options.simplifyTolerance).map(snapPoint) }))
      .filter((l) => l.path.length >= 2 && lineLength(l.path) > snapRadius * 2);

    // --- collect segments and find intersections -------------------------
    interface Seg {
      line: number;
      idx: number; // segment index within polyline
      a: Vec2;
      b: Vec2;
    }
    const segs: Seg[] = [];
    for (let li = 0; li < polylines.length; li++) {
      const path = polylines[li].path;
      for (let i = 0; i < path.length - 1; i++) segs.push({ line: li, idx: i, a: path[i], b: path[i + 1] });
    }

    const cellSize = 50;
    const grid = new Map<string, number[]>();
    const cellsOf = (s: Seg): string[] => {
      const minX = Math.floor(Math.min(s.a[0], s.b[0]) / cellSize);
      const maxX = Math.floor(Math.max(s.a[0], s.b[0]) / cellSize);
      const minZ = Math.floor(Math.min(s.a[1], s.b[1]) / cellSize);
      const maxZ = Math.floor(Math.max(s.a[1], s.b[1]) / cellSize);
      const keys: string[] = [];
      for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) keys.push(`${x},${z}`);
      return keys;
    };
    for (let si = 0; si < segs.length; si++) {
      for (const key of cellsOf(segs[si])) {
        const bucket = grid.get(key);
        if (bucket) bucket.push(si);
        else grid.set(key, [si]);
      }
    }

    // cuts[line][segIdx] = list of t params
    const cuts = new Map<string, { t: number; point: Vec2 }[]>();
    const addCut = (line: number, idx: number, t: number, point: Vec2): void => {
      const key = `${line}:${idx}`;
      const list = cuts.get(key);
      const entry = { t, point: snapPoint(point) };
      if (list) list.push(entry);
      else cuts.set(key, [entry]);
    };

    const tested = new Set<string>();
    for (let si = 0; si < segs.length; si++) {
      const s = segs[si];
      for (const key of cellsOf(s)) {
        for (const oi of grid.get(key)!) {
          if (oi <= si) continue;
          const o = segs[oi];
          if (s.line === o.line && Math.abs(s.idx - o.idx) <= 1) continue;
          const pairKey = `${si}:${oi}`;
          if (tested.has(pairKey)) continue;
          tested.add(pairKey);
          const hit = segmentIntersection(s.a, s.b, o.a, o.b);
          if (!hit) continue;
          addCut(s.line, s.idx, hit.t, hit.point);
          addCut(o.line, o.idx, hit.u, hit.point);
        }
      }
    }

    // --- rebuild polylines with cut points, mark forced nodes ------------
    interface Marked {
      class: StreetClass;
      points: Vec2[];
      forced: boolean[];
    }
    const marked: Marked[] = [];
    for (let li = 0; li < polylines.length; li++) {
      const path = polylines[li].path;
      const points: Vec2[] = [path[0]];
      const forced: boolean[] = [true];
      for (let i = 0; i < path.length - 1; i++) {
        const list = (cuts.get(`${li}:${i}`) ?? []).slice().sort((p, q) => p.t - q.t);
        for (const cut of list) {
          if (dist(points[points.length - 1], cut.point) < 1e-6) {
            forced[forced.length - 1] = true;
            continue;
          }
          points.push(cut.point);
          forced.push(true);
        }
        if (dist(points[points.length - 1], path[i + 1]) >= 1e-6) {
          points.push(path[i + 1]);
          forced.push(false);
        }
      }
      forced[forced.length - 1] = true;
      marked.push({ class: polylines[li].class, points, forced });
    }

    // --- node clustering -------------------------------------------------
    const nodePositions: Vec2[] = [];
    const nodeGrid = new Map<string, number[]>();
    const nodeKey = (p: Vec2): string => `${Math.floor(p[0] / snapRadius)},${Math.floor(p[1] / snapRadius)}`;
    const canonical = (p: Vec2): number => {
      const cx = Math.floor(p[0] / snapRadius);
      const cz = Math.floor(p[1] / snapRadius);
      let best = -1;
      let bestD = snapRadius;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = nodeGrid.get(`${cx + dx},${cz + dz}`);
          if (!bucket) continue;
          for (const ni of bucket) {
            const d = dist(nodePositions[ni], p);
            if (d < bestD) {
              bestD = d;
              best = ni;
            }
          }
        }
      }
      if (best >= 0) return best;
      const ni = nodePositions.length;
      nodePositions.push(p);
      const key = nodeKey(p);
      const bucket = nodeGrid.get(key);
      if (bucket) bucket.push(ni);
      else nodeGrid.set(key, [ni]);
      return ni;
    };

    // --- split into work edges at forced marks ---------------------------
    let workEdges: WorkEdge[] = [];
    for (const m of marked) {
      let start = 0;
      for (let i = 1; i < m.points.length; i++) {
        if (!m.forced[i]) continue;
        const path = m.points.slice(start, i + 1);
        start = i;
        if (path.length < 2) continue;
        const a = canonical(path[0]);
        const b = canonical(path[path.length - 1]);
        const fixed: Polyline = [nodePositions[a], ...path.slice(1, -1), nodePositions[b]];
        if (a === b && lineLength(fixed) < snapRadius * 3) continue;
        workEdges.push({ class: m.class, a, b, path: fixed });
      }
    }

    // --- dedupe parallel edges (same endpoints, same rough midpoint) -----
    workEdges.sort((e1, e2) => CLASS_RANK[e1.class] - CLASS_RANK[e2.class] || lineLength(e1.path) - lineLength(e2.path));
    const seen = new Set<string>();
    workEdges = workEdges.filter((e) => {
      const lo = Math.min(e.a, e.b);
      const hi = Math.max(e.a, e.b);
      const mid = e.path[Math.floor(e.path.length / 2)];
      const key = `${lo}:${hi}:${Math.round(mid[0] / 20)}:${Math.round(mid[1] / 20)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // --- prune dangling chains iteratively -------------------------------
    let changed = true;
    while (changed) {
      changed = false;
      const degree = new Map<number, number>();
      for (const e of workEdges) {
        degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
        degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
      }
      const next = workEdges.filter((e) => (degree.get(e.a) ?? 0) > 1 && (degree.get(e.b) ?? 0) > 1);
      if (next.length !== workEdges.length) {
        workEdges = next;
        changed = true;
      }
    }

    // --- keep the largest connected component ----------------------------
    const parent = new Map<number, number>();
    const find = (x: number): number => {
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r)!;
      let c = x;
      while (parent.get(c) !== c) {
        const p = parent.get(c)!;
        parent.set(c, r);
        c = p;
      }
      return r;
    };
    for (const e of workEdges) {
      if (!parent.has(e.a)) parent.set(e.a, e.a);
      if (!parent.has(e.b)) parent.set(e.b, e.b);
      const ra = find(e.a);
      const rb = find(e.b);
      if (ra !== rb) parent.set(ra, rb);
    }
    const compLength = new Map<number, number>();
    for (const e of workEdges) {
      const r = find(e.a);
      compLength.set(r, (compLength.get(r) ?? 0) + lineLength(e.path));
    }
    let bestComp = -1;
    let bestLen = -1;
    for (const [root, l] of [...compLength.entries()].sort((x, y) => x[0] - y[0])) {
      if (l > bestLen) {
        bestLen = l;
        bestComp = root;
      }
    }
    workEdges = workEdges.filter((e) => find(e.a) === bestComp);

    // --- stable ids ------------------------------------------------------
    const usedNodes = new Set<number>();
    for (const e of workEdges) {
      usedNodes.add(e.a);
      usedNodes.add(e.b);
    }
    const nodeOrder = [...usedNodes].sort((i, j) => {
      const p = nodePositions[i];
      const q = nodePositions[j];
      return p[0] - q[0] || p[1] - q[1] || i - j;
    });
    const nodeIdOf = new Map<number, string>();
    nodeOrder.forEach((ni, i) => nodeIdOf.set(ni, `n${i}`));

    workEdges.sort((e1, e2) => {
      const k1 = [nodeIdOf.get(Math.min(e1.a, e1.b))!, nodeIdOf.get(Math.max(e1.a, e1.b))!];
      const k2 = [nodeIdOf.get(Math.min(e2.a, e2.b))!, nodeIdOf.get(Math.max(e2.a, e2.b))!];
      return (
        k1[0].localeCompare(k2[0]) || k1[1].localeCompare(k2[1]) || lineLength(e1.path) - lineLength(e2.path)
      );
    });

    const nodes: BuiltNode[] = nodeOrder.map((ni, i) => ({
      id: `n${i}`,
      position: nodePositions[ni],
      edgeIds: [],
    }));
    const nodeIndexById = new Map(nodes.map((n, i) => [n.id, i]));
    const edges: BuiltEdge[] = workEdges.map((e, i) => ({
      id: `e${i}`,
      class: e.class,
      from: nodeIdOf.get(e.a)!,
      to: nodeIdOf.get(e.b)!,
      path: e.path,
    }));
    for (const e of edges) {
      nodes[nodeIndexById.get(e.from)!].edgeIds.push(e.id);
      nodes[nodeIndexById.get(e.to)!].edgeIds.push(e.id);
    }
    return { nodes, edges };
  }
}
