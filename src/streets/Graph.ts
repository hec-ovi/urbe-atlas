/**
 * Builds the planar street graph from traced streamlines:
 * split at intersections, snap-cluster nodes, drop folds and self-loops,
 * prune dangling chains, keep the largest connected component,
 * assign stable sorted ids.
 */
import type { Polyline, StreetClass, Vec2 } from '../../schema/blueprint';
import { dist } from '../geom/vec';
import { snapPoint } from '../geom/clip';
import { length as lineLength } from '../geom/polyline';
import { cleanCenterline } from './centerline';
import { resolveGraphPaths } from './GraphResolution';
import { GraphContacts } from './GraphContacts';
import { simplifyJoinedPaths } from './SourceJunctions';
import type { TracedLine } from './StreamlineTracer';
import type { StreetDomain } from './domain/StreetDomain';
import { invariantFailure } from '../errors';

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

interface WorkEdge {
  class: StreetClass;
  a: number; // node index
  b: number;
  path: Polyline;
}

export class StreetGraphBuilder {
  static extend(
    graph: { edges: readonly BuiltEdge[] },
    lines: TracedLine[],
    options: { domain: StreetDomain },
  ): { nodes: BuiltNode[]; edges: BuiltEdge[] } {
    return this.build([...graph.edges.map(({ class: kind, path }) => ({ class: kind, path })), ...lines], {
      ...options, simplifyTolerance: 0, snapRadius: 0,
    });
  }

  static build(
    lines: TracedLine[],
    options: { simplifyTolerance: number; snapRadius: number; domain: StreetDomain },
  ): { nodes: BuiltNode[]; edges: BuiltEdge[] } {
    const { snapRadius, domain } = options;
    const sources = lines.map((line) => line.path.map(snapPoint));
    for (const source of sources) {
      if (!domain.covers(source)) throw invariantFailure('source street leaves its reserved domain', { path: source });
    }
    const simplified = simplifyJoinedPaths(sources, options.simplifyTolerance);
    const polylines = lines
      .map((line, index) => {
        const path = simplified[index];
        return { class: line.class, path: domain.covers(path) ? path : sources[index] };
      })
      .filter((l) => l.path.length >= 2 && lineLength(l.path) > snapRadius * 2);

    const marked = GraphContacts.node(polylines.map((line) => line.path), domain)
      .map((path, index) => ({ ...path, class: polylines[index].class }));

    // --- node clustering -------------------------------------------------
    const nodePositions: Vec2[] = [];
    const exactNodes = new Map<string, number>();
    const nodeGrid = new Map<string, number[]>();
    const nodeKey = (p: Vec2): string => `${Math.floor(p[0] / snapRadius)},${Math.floor(p[1] / snapRadius)}`;
    const canonical = (p: Vec2, accepts: (candidate: Vec2) => boolean): number => {
      const exactKey = `${p[0]},${p[1]}`;
      const exact = exactNodes.get(exactKey);
      if (exact !== undefined) return exact;
      let best = -1;
      let bestD = snapRadius;
      if (snapRadius > 0) {
        const cx = Math.floor(p[0] / snapRadius);
        const cz = Math.floor(p[1] / snapRadius);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const bucket = nodeGrid.get(`${cx + dx},${cz + dz}`);
            if (!bucket) continue;
            for (const ni of bucket) {
              const d = dist(nodePositions[ni], p);
              if (d < bestD && accepts(nodePositions[ni])) {
                bestD = d;
                best = ni;
              }
            }
          }
        }
      }
      if (best >= 0) return best;
      const ni = nodePositions.length;
      nodePositions.push(p);
      exactNodes.set(exactKey, ni);
      if (snapRadius > 0) {
        const key = nodeKey(p);
        const bucket = nodeGrid.get(key);
        if (bucket) bucket.push(ni);
        else nodeGrid.set(key, [ni]);
      }
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
        const a = canonical(path[0], (candidate) => domain.covers(cleanCenterline([candidate, ...path.slice(1)])));
        const b = canonical(path[path.length - 1], (candidate) =>
          domain.covers(cleanCenterline([nodePositions[a], ...path.slice(1, -1), candidate])));
        // a run that returns to the node it left is a fold, never a street
        if (a === b) continue;
        const fixed = cleanCenterline([nodePositions[a], ...path.slice(1, -1), nodePositions[b]]);
        if (!domain.covers(fixed)) {
          throw invariantFailure('street graph edit leaves its reserved domain', { path, fixed });
        }
        workEdges.push({ class: m.class, a, b, path: fixed });
      }
    }

    // --- normalize compatible paths at the declared graph resolution -----
    workEdges = resolveGraphPaths(workEdges, snapRadius);

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
