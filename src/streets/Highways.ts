/**
 * A highway is a through route: its deck crosses the city and leaves at the
 * boundary. A tracer can stop a streamline in the middle of the city (a
 * degenerate field point, a separation hit that found nothing to join), which
 * would leave an elevated road dead-ending over a block. Those ends are walked
 * back and demoted to `road`, one edge per pass, until every highway end is
 * either a junction with another highway or a point at the city edge.
 */
import type {
  HighwayStructure,
  Polygon,
  Polyline,
  StreetClass,
  Vec2,
} from '../../schema/blueprint';
import type { BuiltEdge, BuiltNode } from './Graph';
import { distanceToOutline } from '../geom/polygon';
import { snapPoint } from '../geom/clip';
import { length as pathLength, pointAt } from '../geom/polyline';
import { LEVELS } from '../levels';

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

/** Highway construction dimensions shared by the blueprint and preview. */
export const HIGHWAY_DECK = {
  thickness: 1,
  rampLength: 60,
  supportPitch: 30,
  supportSize: 2,
  buildingClearance: 1,
} as const;

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
 * One continuous highway route. `path` runs end to end; the two ramp flags say
 * whether that end is a terminus (the route leaves the city, so a deck ramps to
 * the ground there) or a junction with other highway arms (the deck stays up).
 */
export interface HighwayRun {
  edgeIds: string[];
  path: Polyline;
  rampAtStart: boolean;
  rampAtEnd: boolean;
}

/**
 * The highway network as continuous routes: consecutive edges join into one
 * run, so a consumer draws one deck per route instead of a slab per edge. A run
 * is a maximal chain, grown both ways from its seed edge and cut only where the
 * network ends or forks; a ring closes on itself and never ramps.
 */
export function highwayRuns(edges: readonly ClassedEdge[]): HighwayRun[] {
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

  /** The next edge along, or undefined where the chain ends or forks. */
  const onward = (node: string, from: string): string | undefined => {
    const here = (at.get(node) ?? []).filter((id) => id !== from);
    return here.length === 1 && !used.has(here[0]) ? here[0] : undefined;
  };

  /** Edge ids from `node` outward, in order, marking each used; `end` is where the chain stops. */
  const chainFrom = (node: string, first: string | undefined): { ids: string[]; end: string } => {
    const ids: string[] = [];
    let end = node;
    let id = first;
    while (id) {
      used.add(id);
      ids.push(id);
      const edge = byId.get(id)!;
      end = edge.from === end ? edge.to : edge.from;
      id = onward(end, id);
    }
    return { ids, end };
  };

  const runs: HighwayRun[] = [];
  for (const seed of highways) {
    if (used.has(seed.id)) continue;
    used.add(seed.id);
    const ahead = chainFrom(seed.to, onward(seed.to, seed.id));
    const behind = chainFrom(seed.from, onward(seed.from, seed.id));
    const ids = [...behind.ids.reverse(), seed.id, ...ahead.ids];

    const path: Vec2[] = [];
    let node = behind.end;
    for (const id of ids) {
      const edge = byId.get(id)!;
      const forward = edge.from === node;
      for (const point of forward ? edge.path : [...edge.path].reverse()) {
        const last = path[path.length - 1];
        if (!last || last[0] !== point[0] || last[1] !== point[1]) path.push(point);
      }
      node = forward ? edge.to : edge.from;
    }
    if (path.length < 2) continue;
    const ring = behind.end === ahead.end;
    runs.push({
      edgeIds: ids,
      path,
      rampAtStart: !ring && (at.get(behind.end) ?? []).length === 1,
      rampAtEnd: !ring && (at.get(ahead.end) ?? []).length === 1,
    });
  }
  return runs;
}

/**
 * Publishes the construction arithmetic for every elevated run. The street
 * graph has already reserved the whole carriageway before parcels are cut;
 * the explicit clearance check makes that relationship fail closed if a
 * future block or zoning change puts a building under the deck.
 */
export function highwayStructures(edges: readonly ClassedEdge[]): HighwayStructure[] {
  const byId = new Map(edges.map((edge) => [edge.id, edge]));
  return highwayRuns(edges).map((run) => {
    const first = byId.get(run.edgeIds[0])!;
    const width = 'width' in first && typeof first.width === 'number' ? first.width : 15;
    const level = 'level' in first && typeof first.level === 'number' ? first.level : LEVELS.highway;
    const total = pathLength(run.path);
    const maxRamp = total / ((run.rampAtStart ? 1 : 0) + (run.rampAtEnd ? 1 : 0) || 1);
    const ramps = {
      start: run.rampAtStart ? Math.min(HIGHWAY_DECK.rampLength, maxRamp) : 0,
      end: run.rampAtEnd ? Math.min(HIGHWAY_DECK.rampLength, maxRamp) : 0,
    };
    const supports = [];
    const flatStart = ramps.start;
    const flatEnd = total - ramps.end;
    for (let along = flatStart + HIGHWAY_DECK.supportPitch / 2; along < flatEnd; along += HIGHWAY_DECK.supportPitch) {
      const position = snapPoint(pointAt(run.path, along));
      const half = HIGHWAY_DECK.supportSize / 2;
      const footprint: Polygon = [
        [position[0] - half, position[1] - half],
        [position[0] + half, position[1] - half],
        [position[0] + half, position[1] + half],
        [position[0] - half, position[1] + half],
      ];
      supports.push({
        position,
        footprint,
        bottom: LEVELS.ground,
        top: level - HIGHWAY_DECK.thickness,
      });
    }
    return {
      edgeIds: run.edgeIds,
      path: run.path,
      width,
      level,
      deckThickness: HIGHWAY_DECK.thickness,
      ramps,
      supports,
    };
  });
}
