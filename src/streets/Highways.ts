/**
 * A highway is a through route: its deck crosses the city and leaves at the
 * boundary. A tracer can stop a streamline in the middle of the city (a
 * degenerate field point, a separation hit that found nothing to join), which
 * would leave an elevated road dead-ending over a block. Those ends are walked
 * back and demoted to `road`, one edge per pass, until every highway end is
 * either a junction with another highway or a point at the city edge.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import type { BuiltEdge, BuiltNode } from './Graph';
import { distanceToOutline } from '../geom/polygon';
import { length as pathLength } from '../geom/polyline';
import { dist } from '../geom/vec';

import { HIGHWAY_DECK, highwayRuns } from './construction/highway';
import type { ClassedEdge } from './construction/highway';

export {
  HIGHWAY_DECK, applyHighwayElevationProfiles, highwayEnvelopes, highwayElevationProfile,
  highwayRuns, highwayStructures, levelAt, supportHighwayEnvelopes,
} from './construction/highway';
export type { ClassedEdge, HighwayConstructionEdge, HighwayEnvelope, HighwayRun } from './construction/highway';

/** What they need of a node. */
export interface PositionedNode {
  id: string;
  position: Vec2;
}

/** How near the boundary a highway end counts as leaving the city. */
export const HIGHWAY_EXIT_TOLERANCE = 30;

/** Two full ramps plus one supportable flat span. */
export const MIN_HIGHWAY_RUN = HIGHWAY_DECK.rampLength * 2 + HIGHWAY_DECK.supportPitch;

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
 * Keeps only structurally useful highway runs. When tracing leaves no usable
 * through route, the shortest graph route between the farthest city-edge
 * nodes becomes the highway. Its endpoints remain real graph junctions at
 * grade and its middle rises onto a supportable deck.
 */
export function ensureUsableHighway(edges: BuiltEdge[], nodes: readonly BuiltNode[], boundary: Polygon): number {
  demoteDeadEnds(edges, nodes, boundary);
  let changed = 0;
  for (const run of highwayRuns(edges)) {
    const flat = pathLength(run.path)
      - (run.rampAtStart ? HIGHWAY_DECK.rampLength : 0)
      - (run.rampAtEnd ? HIGHWAY_DECK.rampLength : 0);
    if (flat >= HIGHWAY_DECK.supportPitch) continue;
    const ids = new Set(run.edgeIds);
    for (const edge of edges) {
      if (!ids.has(edge.id) || edge.class !== 'highway') continue;
      edge.class = 'road';
      changed++;
    }
  }
  demoteDeadEnds(edges, nodes, boundary);
  if (edges.some((edge) => edge.class === 'highway')) return changed;

  const candidates = nodes
    .filter((node) => distanceToOutline(node.position, boundary) <= HIGHWAY_EXIT_TOLERANCE)
    .sort((a, b) => a.id.localeCompare(b.id));
  let endpoints: [BuiltNode, BuiltNode] | null = null;
  let separation = -Infinity;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const apart = dist(candidates[i].position, candidates[j].position);
      if (apart > separation + 1e-9) {
        endpoints = [candidates[i], candidates[j]];
        separation = apart;
      }
    }
  }
  if (!endpoints || separation < MIN_HIGHWAY_RUN) return changed;
  const route = shortestGraphRoute(edges, endpoints[0].id, endpoints[1].id);
  if (!route || route.length < MIN_HIGHWAY_RUN) return changed;
  const ids = new Set(route.edgeIds);
  for (const edge of edges) {
    if (!ids.has(edge.id) || edge.class === 'highway') continue;
    edge.class = 'highway';
    changed++;
  }
  return changed;
}

interface GraphRoute {
  edgeIds: string[];
  length: number;
}

/** Deterministic Dijkstra over the already planar street graph. */
function shortestGraphRoute(edges: readonly BuiltEdge[], from: string, to: string): GraphRoute | null {
  const adjacency = new Map<string, { edge: BuiltEdge; other: string; length: number }[]>();
  for (const edge of edges) {
    if (edge.class === 'alley') continue;
    const length = pathLength(edge.path);
    (adjacency.get(edge.from) ?? adjacency.set(edge.from, []).get(edge.from)!).push({ edge, other: edge.to, length });
    (adjacency.get(edge.to) ?? adjacency.set(edge.to, []).get(edge.to)!).push({ edge, other: edge.from, length });
  }
  for (const list of adjacency.values()) list.sort((a, b) => a.edge.id.localeCompare(b.edge.id));
  const distances = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, { node: string; edgeId: string }>();
  const visited = new Set<string>();
  while (true) {
    let current: string | null = null;
    let best = Infinity;
    for (const [node, distance] of distances) {
      if (visited.has(node)) continue;
      if (distance < best - 1e-9 || (Math.abs(distance - best) <= 1e-9 && (current === null || node < current))) {
        current = node;
        best = distance;
      }
    }
    if (current === null) return null;
    if (current === to) break;
    visited.add(current);
    for (const step of adjacency.get(current) ?? []) {
      const candidate = best + step.length;
      const old = distances.get(step.other);
      if (old !== undefined && candidate >= old - 1e-9) continue;
      distances.set(step.other, candidate);
      previous.set(step.other, { node: current, edgeId: step.edge.id });
    }
  }
  const edgeIds: string[] = [];
  let current = to;
  while (current !== from) {
    const step = previous.get(current);
    if (!step) return null;
    edgeIds.push(step.edgeId);
    current = step.node;
  }
  return { edgeIds: edgeIds.reverse(), length: distances.get(to)! };
}
