/**
 * A highway is a through route: its deck crosses the city and leaves at the
 * boundary. A tracer can stop a streamline in the middle of the city (a
 * degenerate field point, a separation hit that found nothing to join), which
 * would leave an elevated road dead-ending over a block. Those ends are walked
 * back and demoted to `road`, one edge per pass, until every highway end is
 * either a junction with another highway or a point at the city edge.
 */
import type {
  ElevationPoint,
  HighwayStructure,
  Polygon,
  Polyline,
  StreetEdge,
  StreetClass,
  Vec2,
} from '../../schema/blueprint';
import type { BuiltEdge, BuiltNode } from './Graph';
import { distanceToOutline } from '../geom/polygon';
import { intersection, snapPoint } from '../geom/clip';
import { area, bounds } from '../geom/polygon';
import { directionAt, length as pathLength, pointAt } from '../geom/polyline';
import { add, dist, scale } from '../geom/vec';
import { LEVELS } from '../levels';
import { invariantFailure } from '../errors';

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
export function highwayStructures(edges: readonly ClassedEdge[], gradeObstacles: readonly Polygon[] = []): HighwayStructure[] {
  const byId = new Map(edges.map((edge) => [edge.id, edge]));
  const obstacles = gradeObstacles.map((polygon) => ({ polygon, box: bounds(polygon) }));
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
    const elevationProfile = highwayElevationProfile(total, level, ramps);
    const supports = [];
    const flatStart = ramps.start;
    const flatEnd = total - ramps.end;
    let previousAlong = flatStart;
    let targetAlong = flatStart + HIGHWAY_DECK.supportPitch / 2;
    while (targetAlong < flatEnd) {
      // Keep the regular pitch until a grade-level rail reservation crosses
      // the corridor, then shift this and all following columns backward onto
      // the same new pitch. This brackets the crossing without opening an
      // unsupported span wider than supportPitch.
      let along = targetAlong;
      let support = clearSupportAt(run.path, along, width, level, obstacles);
      while (!support && along > previousAlong + 1) {
        along -= 1;
        support = clearSupportAt(run.path, along, width, level, obstacles);
      }
      if (!support) {
        throw invariantFailure(`highway ${run.edgeIds[0]} cannot place a support clear of grade infrastructure`);
      }
      supports.push(support);
      previousAlong = along;
      targetAlong = along + HIGHWAY_DECK.supportPitch;
    }
    return {
      edgeIds: run.edgeIds,
      path: run.path,
      width,
      level,
      deckThickness: HIGHWAY_DECK.thickness,
      ramps,
      elevationProfile,
      supports,
    };
  });
}

/** Height knots for one highway run, including both grade-to-deck transitions. */
export function highwayElevationProfile(
  total: number,
  level: number,
  ramps: HighwayStructure['ramps'],
): ElevationPoint[] {
  const points: ElevationPoint[] = [{ distance: 0, level: ramps.start > 0 ? LEVELS.ground : level }];
  if (ramps.start > 0) points.push({ distance: ramps.start, level });
  if (ramps.end > 0) points.push({ distance: total - ramps.end, level });
  points.push({ distance: total, level: ramps.end > 0 ? LEVELS.ground : level });
  return points
    .sort((a, b) => a.distance - b.distance)
    .filter((point, i, sorted) => i === 0 || Math.abs(point.distance - sorted[i - 1].distance) > 1e-9);
}

/**
 * Publishes the height of each routing edge in its own from-to direction.
 * Ramp breakpoints that fall inside an edge are retained as explicit knots.
 */
export function applyHighwayElevationProfiles(edges: StreetEdge[]): void {
  for (const edge of edges) {
    const total = pathLength(edge.path);
    edge.elevationProfile = [
      { distance: 0, level: edge.level },
      { distance: total, level: edge.level },
    ];
  }
  const byId = new Map(edges.map((edge) => [edge.id, edge]));
  for (const run of highwayRuns(edges)) {
    const first = byId.get(run.edgeIds[0])!;
    const total = pathLength(run.path);
    const ends = (run.rampAtStart ? 1 : 0) + (run.rampAtEnd ? 1 : 0);
    const maxRamp = total / (ends || 1);
    const ramps = {
      start: run.rampAtStart ? Math.min(HIGHWAY_DECK.rampLength, maxRamp) : 0,
      end: run.rampAtEnd ? Math.min(HIGHWAY_DECK.rampLength, maxRamp) : 0,
    };
    const runProfile = highwayElevationProfile(total, first.level, ramps);
    let runDistance = 0;
    let position = run.path[0];
    for (const edgeId of run.edgeIds) {
      const edge = byId.get(edgeId)!;
      const edgeLength = pathLength(edge.path);
      const forward = dist(edge.path[0], position) <= 0.002;
      const backward = dist(edge.path[edge.path.length - 1], position) <= 0.002;
      if (!forward && !backward) {
        throw invariantFailure(`highway run loses edge ${edge.id} at ${position.join(',')}`);
      }
      const far = forward ? edge.path[edge.path.length - 1] : edge.path[0];
      const distances = [runDistance, runDistance + edgeLength];
      for (const point of runProfile) {
        if (point.distance > runDistance + 1e-9 && point.distance < runDistance + edgeLength - 1e-9) {
          distances.push(point.distance);
        }
      }
      edge.elevationProfile = distances
        .map((distance) => ({
          distance: forward ? distance - runDistance : runDistance + edgeLength - distance,
          level: levelAt(runProfile, distance),
        }))
        .sort((a, b) => a.distance - b.distance);
      runDistance += edgeLength;
      position = far;
    }
  }
}

/** Linear interpolation between the two surrounding height knots. */
export function levelAt(profile: readonly ElevationPoint[], distance: number): number {
  if (distance <= profile[0].distance) return profile[0].level;
  for (let i = 1; i < profile.length; i++) {
    const next = profile[i];
    if (distance > next.distance) continue;
    const previous = profile[i - 1];
    const span = next.distance - previous.distance;
    const t = span <= 1e-9 ? 0 : (distance - previous.distance) / span;
    return previous.level + (next.level - previous.level) * t;
  }
  return profile[profile.length - 1].level;
}

function clearSupportAt(
  path: Polyline,
  along: number,
  deckWidth: number,
  level: number,
  obstacles: readonly { polygon: Polygon; box: ReturnType<typeof bounds> }[],
): HighwayStructure['supports'][number] | null {
  const center = pointAt(path, along);
  const direction = directionAt(path, along);
  const side: Vec2 = [-direction[1], direction[0]];
  const lateral = Math.max(0, deckWidth / 2 - HIGHWAY_DECK.supportSize / 2 - 0.5);
  for (const offset of [0, lateral, -lateral]) {
      const position = snapPoint(add(center, scale(side, offset)));
      const half = HIGHWAY_DECK.supportSize / 2;
      const footprint: Polygon = [
        [position[0] - half, position[1] - half],
        [position[0] + half, position[1] - half],
        [position[0] + half, position[1] + half],
        [position[0] - half, position[1] + half],
      ];
      const support = {
        position,
        footprint,
        bottom: LEVELS.ground,
        top: level - HIGHWAY_DECK.thickness,
      };
      if (!hitsAny(footprint, obstacles)) return support;
  }
  return null;
}

function hitsAny(
  footprint: Polygon,
  obstacles: readonly { polygon: Polygon; box: ReturnType<typeof bounds> }[],
): boolean {
  const box = bounds(footprint);
  return obstacles.some((obstacle) => {
    if (obstacle.box.min[0] >= box.max[0] || obstacle.box.max[0] <= box.min[0]
      || obstacle.box.min[1] >= box.max[1] || obstacle.box.max[1] <= box.min[1]) return false;
    return intersection([footprint], [obstacle.polygon]).reduce((sum, polygon) => sum + area(polygon), 0) > 1e-6;
  });
}
