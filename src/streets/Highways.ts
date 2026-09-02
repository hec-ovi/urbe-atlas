/**
 * A highway is a through route: its deck crosses the city and leaves at the
 * boundary. A tracer can stop a streamline in the middle of the city (a
 * degenerate field point, a separation hit that found nothing to join), which
 * would leave an elevated road dead-ending over a block. Those ends are walked
 * back and demoted to `road`, one edge per pass, until every highway end is
 * either a junction with another highway or a point at the city edge.
 */
import type { Polygon, Polyline, StreetClass, Vec2 } from '../../schema/blueprint';
import type { BuiltEdge, BuiltNode } from './Graph';
import { distanceToOutline } from '../geom/polygon';

/** What these rules need of an edge: the shape shared by the graph and the blueprint. */
export interface ClassedEdge {
  id: string;
  class: StreetClass;
  from: string;
  to: string;
  path: Polyline;
}

/** What they need of a node. */
export interface PositionedNode {
  id: string;
  position: Vec2;
}

/** How near the boundary a highway end counts as leaving the city. */
export const HIGHWAY_EXIT_TOLERANCE = 30;

/** Nodes where a highway ends: exactly one highway edge meets there. */
export function highwayEndNodes(edges: readonly ClassedEdge[]): Map<string, string[]> {
  const byNode = new Map<string, string[]>();
  for (const e of edges) {
    if (e.class !== 'highway') continue;
    for (const node of [e.from, e.to]) {
      const list = byNode.get(node);
      if (list) list.push(e.id);
      else byNode.set(node, [e.id]);
    }
  }
  for (const [node, ids] of byNode) if (ids.length !== 1) byNode.delete(node);
  return byNode;
}

/** Ends that stop inside the city, with their distance to the boundary. */
export function interiorHighwayEnds(
  edges: readonly ClassedEdge[],
  nodes: readonly PositionedNode[],
  boundary: Polygon,
): { nodeId: string; edgeId: string; distance: number }[] {
  const position = new Map<string, Vec2>(nodes.map((n) => [n.id, n.position]));
  const out: { nodeId: string; edgeId: string; distance: number }[] = [];
  for (const [nodeId, ids] of highwayEndNodes(edges)) {
    const p = position.get(nodeId);
    if (!p) continue;
    const distance = distanceToOutline(p, boundary);
    if (distance > HIGHWAY_EXIT_TOLERANCE) out.push({ nodeId, edgeId: ids[0], distance });
  }
  return out;
}

/**
 * Demotes dangling highway chains to road, in place. The graph keeps its
 * geometry: only the class changes, so blocks along a demoted stretch gain the
 * sidewalks and the parcels a highway denies them.
 */
export function demoteDeadEnds(edges: BuiltEdge[], nodes: readonly BuiltNode[], boundary: Polygon): number {
  const byId = new Map(edges.map((e) => [e.id, e]));
  let demoted = 0;
  for (let pass = 0; pass < edges.length; pass++) {
    const dangling = interiorHighwayEnds(edges, nodes, boundary);
    if (dangling.length === 0) break;
    for (const { edgeId } of dangling) {
      const edge = byId.get(edgeId);
      if (edge && edge.class === 'highway') {
        edge.class = 'road';
        demoted++;
      }
    }
  }
  return demoted;
}

/**
 * The highway network as continuous polylines: consecutive edges join into one
 * run, so a consumer draws one deck per route instead of a slab per edge.
 * Every run is a maximal chain; a ring closes on itself.
 */
export function highwayRuns(edges: readonly ClassedEdge[]): Polyline[] {
  const highways = edges.filter((e) => e.class === 'highway');
  const at = new Map<string, string[]>();
  for (const e of highways) {
    for (const node of [e.from, e.to]) {
      const list = at.get(node);
      if (list) list.push(e.id);
      else at.set(node, [e.id]);
    }
  }
  const byId = new Map(highways.map((e) => [e.id, e]));
  const used = new Set<string>();
  const runs: Polyline[] = [];

  const walk = (startNode: string, firstEdge: string): void => {
    const path: Vec2[] = [];
    let node = startNode;
    let edgeId: string | undefined = firstEdge;
    while (edgeId && !used.has(edgeId)) {
      const edge = byId.get(edgeId)!;
      used.add(edgeId);
      const forward = edge.from === node;
      const segment = forward ? edge.path : [...edge.path].slice().reverse();
      for (const point of segment) {
        const last = path[path.length - 1];
        if (!last || last[0] !== point[0] || last[1] !== point[1]) path.push(point);
      }
      node = forward ? edge.to : edge.from;
      // a run continues only where exactly two highway edges meet: a fork ends it
      const here = (at.get(node) ?? []).filter((id) => id !== edgeId);
      edgeId = here.length === 1 ? here[0] : undefined;
    }
    if (path.length >= 2) runs.push(path);
  };

  // open runs first, from every end, then whatever rings are left
  for (const [nodeId, ids] of at) {
    if (ids.length === 1 && !used.has(ids[0])) walk(nodeId, ids[0]);
  }
  for (const e of highways) {
    if (!used.has(e.id)) walk(e.from, e.id);
  }
  return runs;
}
