/** Routes subway plans through the published street graph. */
import type { Polyline, StreetClass, StreetEdge, Vec2 } from '../../schema/blueprint';
import type { BuiltNode } from '../streets/Graph';
import { dist } from '../geom/vec';
import { length as lineLength } from '../geom/polyline';
import { LEVELS } from '../levels';
import { SubwayPlanner } from './SubwayPlanner';
import type { SubwayOptions, SubwayPlan } from './schema';

interface Adj { edge: StreetEdge; other: string; length: number }

export class TransitPlanner {
  private readonly nodes: BuiltNode[];
  private readonly nodeById = new Map<string, BuiltNode>();
  private readonly edgeById = new Map<string, StreetEdge>();
  private readonly adjacency = new Map<string, Adj[]>();

  constructor(nodes: BuiltNode[], edges: StreetEdge[]) {
    this.nodes = nodes;
    for (const n of nodes) this.nodeById.set(n.id, n);
    for (const e of edges) {
      this.edgeById.set(e.id, e);
      const l = lineLength(e.path);
      const from = stateKey(e.from, e.elevationProfile[0].level);
      const to = stateKey(e.to, e.elevationProfile[e.elevationProfile.length - 1].level);
      const fwd: Adj = { edge: e, other: to, length: l };
      const bwd: Adj = { edge: e, other: from, length: l };
      (this.adjacency.get(from) ?? this.adjacency.set(from, []).get(from)!).push(fwd);
      (this.adjacency.get(to) ?? this.adjacency.set(to, []).get(to)!).push(bwd);
    }
  }

  nearestNode(p: Vec2, filter?: (n: BuiltNode) => boolean): BuiltNode {
    let best = this.nodes[0];
    let bestD = Infinity;
    for (const n of this.nodes) {
      if (filter && !filter(n)) continue;
      const d = dist(n.position, p);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  /** Deterministic Dijkstra; returns ordered edge ids, or null. */
  shortestPath(fromId: string, toId: string, classCost: Record<StreetClass, number>): string[] | null {
    const fromState = stateKey(fromId, LEVELS.ground);
    const toState = stateKey(toId, LEVELS.ground);
    if (!this.adjacency.has(fromState) || !this.adjacency.has(toState)) return null;
    const distMap = new Map<string, number>();
    const prevEdge = new Map<string, string>();
    const prevState = new Map<string, string>();
    const visited = new Set<string>();
    distMap.set(fromState, 0);
    while (true) {
      let cur: string | null = null;
      let curD = Infinity;
      for (const [id, d] of distMap) {
        if (!visited.has(id) && (d < curD || (d === curD && (cur === null || id < cur)))) {
          cur = id;
          curD = d;
        }
      }
      if (cur === null) return null;
      if (cur === toState) break;
      visited.add(cur);
      for (const a of this.adjacency.get(cur) ?? []) {
        if (!Number.isFinite(classCost[a.edge.class])) continue;
        const nd = curD + a.length * classCost[a.edge.class];
        const old = distMap.get(a.other);
        if (old === undefined || nd < old - 1e-9) {
          distMap.set(a.other, nd);
          prevEdge.set(a.other, a.edge.id);
          prevState.set(a.other, cur);
        }
      }
    }
    const out: string[] = [];
    let cur = toState;
    while (cur !== fromState) {
      const e = prevEdge.get(cur);
      if (!e) return null;
      out.push(e);
      cur = prevState.get(cur)!;
    }
    return out.reverse();
  }

  /** Concatenated geometry of an edge-id path starting at fromId. */
  pathGeometry(fromId: string, edgeIds: string[]): Polyline {
    const out: Polyline = [];
    let at = fromId;
    for (const id of edgeIds) {
      const e = this.edgeById.get(id)!;
      const seg = e.from === at ? e.path : [...e.path].reverse();
      for (let i = out.length > 0 ? 1 : 0; i < seg.length; i++) out.push(seg[i]);
      at = e.from === at ? e.to : e.from;
    }
    return out;
  }

  planSubway(options: SubwayOptions): SubwayPlan {
    const cost: Record<StreetClass, number> = { highway: 1.2, road: 0.5, street: 1.1, alley: Infinity };
    return new SubwayPlanner([...this.edgeById.values()], {
      nearest: (point, minimumArms = 1) => this.nearestNode(point,
        (node) => (this.adjacency.get(stateKey(node.id, LEVELS.ground))?.length ?? 0) >= minimumArms),
      path: (fromId, toId) => {
        const edges = this.shortestPath(fromId, toId, cost);
        return edges ? edges.length === 0 ? [this.nodeById.get(fromId)!.position] : this.pathGeometry(fromId, edges) : null;
      },
    }).plan(options);
  }
}

function stateKey(nodeId: string, level: number): string {
  return `${nodeId}@${level.toFixed(9)}`;
}
