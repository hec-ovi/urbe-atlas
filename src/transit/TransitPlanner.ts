/**
 * Places transit deterministically: bus routes between district anchor pairs
 * via demand-weighted shortest paths, stops at researched spacing; subway
 * lines radial through a shared downtown hub (network connected by
 * construction); train line through the main station(s) on its own
 * right-of-way. Counts follow population power laws from docs/RESEARCH.md.
 */
import type {
  BusRoute,
  BusStop,
  Polygon,
  Polyline,
  Station,
  StreetClass,
  StreetEdge,
  Transit,
  Vec2,
} from '../../schema/blueprint';
import type { Rng } from '../core/rng';
import type { PlannedDistrict } from '../districts/DistrictPlanner';
import type { BuiltNode } from '../streets/Graph';
import { closestOnSegment, dist, normalize, sub, add, scale } from '../geom/vec';
import { directionAt, distanceTo, length as lineLength, offsetAt } from '../geom/polyline';
import { RAIL, boxOf, platformOf } from './stations';
import { LEVELS } from '../levels';
import { bounds, distanceToOutline, pointInPolygon } from '../geom/polygon';
import { sidewalkBand } from '../streets/construction/SidewalkSection';
import { StreetCorridors } from '../streets/construction/StreetCorridors';
import { invalidParams, unsatisfiable } from '../errors';
import { SubwayPlanner } from './SubwayPlanner';
import type { SubwayOptions, SubwayPlan, TrainOptions, TrainPlan, TransitOptions } from './schema';

interface Adj {
  edge: StreetEdge;
  /** Logical node key, including its endpoint elevation. */
  other: string;
  length: number;
}

/** Alleys are pedestrian: they never enter the planner's graph, and the cost keeps them out. */
const CLASS_COST: Record<StreetClass, number> = { highway: 1.4, road: 0.6, street: 1.0, alley: Infinity };

export type { TrainPlan } from './schema';

export class TransitPlanner {
  /** 1 in a city 1.6 km across or larger; smaller cities space their bus stops closer, in proportion. */
  private stopScale = 1;
  private readonly nodes: BuiltNode[];
  private readonly nodeById = new Map<string, BuiltNode>();
  private readonly edgeById = new Map<string, StreetEdge>();
  private readonly adjacency = new Map<string, Adj[]>();
  private readonly usage = new Map<string, number>();

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
        const worn = 1 + 0.6 * (this.usage.get(a.edge.id) ?? 0);
        const nd = curD + a.length * classCost[a.edge.class] * worn;
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

  plan(options: TransitOptions): Transit {
    const { districts, cityCenter, population, rng } = options;
    if (options.features.subways && !options.subwayPlan) throw invalidParams('subway service requires its pre-parcel plan');
    if (options.features.trains && !options.trainPlan) throw invalidParams('train service requires its pre-parcel plan');
    const subwayPlan = options.features.subways ? options.subwayPlan : undefined;
    const trainPlan = options.features.trains ? options.trainPlan : undefined;
    const extent = bounds(options.boundary);
    this.stopScale = Math.min(1, Math.min(extent.max[0] - extent.min[0], extent.max[1] - extent.min[1]) / FULL_SIZE_EXTENT);
    const transit: Transit = {
      busStops: [],
      busRoutes: [],
      trainStations: trainPlan?.trainStations ?? [],
      trainLines: trainPlan?.trainLines ?? [],
      subwayStations: subwayPlan?.subwayStations ?? [],
      subwayLines: subwayPlan?.subwayLines ?? [],
      ...(subwayPlan?.subwayDemand ? { subwayDemand: subwayPlan.subwayDemand } : {}),
    };

    // --- terminal pairs: districts opposite through the center -----------
    const byAngle = districts
      .map((d) => ({ d, angle: Math.atan2(d.center[1] - cityCenter[1], d.center[0] - cityCenter[0]) }))
      .sort((a, b) => a.angle - b.angle || a.d.index - b.d.index)
      .map((x) => x.d);
    const pairs: [PlannedDistrict, PlannedDistrict][] = [];
    const half = Math.floor(byAngle.length / 2);
    for (let i = 0; i < byAngle.length; i++) {
      pairs.push([byAngle[i], byAngle[(i + Math.max(1, half)) % byAngle.length]]);
    }

    // --- bus routes ------------------------------------------------------
    const routeCount = Math.min(Math.max(Math.round(12 * Math.pow(population / 100_000, 0.65)), 2), 24);
    const busRng = rng.fork('bus');
    const stopIndex = new Map<string, BusStop[]>(); // edgeId -> stops
    for (let r = 0; r < routeCount; r++) {
      const [da, db] = pairs[r % pairs.length];
      const jitterA = busRng.range(-120, 120);
      const jitterB = busRng.range(-120, 120);
      const from = this.nearestNode(add(da.center, [jitterA, -jitterB]), (node) => this.hasGroundConnection(node.id));
      const to = this.nearestNode(add(db.center, [jitterB, jitterA]), (node) => this.hasGroundConnection(node.id));
      if (from.id === to.id) continue;
      const edgeIds = this.shortestPath(from.id, to.id, CLASS_COST);
      if (!edgeIds || edgeIds.length === 0) continue;
      for (const id of edgeIds) this.usage.set(id, (this.usage.get(id) ?? 0) + 1);
      const stopIds = this.placeBusStops(from.id, edgeIds, options.districtOfNode, districts, cityCenter, stopIndex, transit.busStops);
      if (stopIds.length < 2) continue;
      transit.busRoutes.push({ id: `br${transit.busRoutes.length}`, stopIds, edgeIds } satisfies BusRoute);
    }

    return transit;
  }

  /**
   * Plans the grade-level railway before parcels are cut, so its exact track
   * bed and platform footprints can be reserved as one right-of-way.
   */
  planTrain(options: TrainOptions): TrainPlan {
    const extent = bounds(options.boundary);
    if (Math.min(extent.max[0] - extent.min[0], extent.max[1] - extent.min[1]) < MIN_TRAIN_CITY_EXTENT) {
      return { trainStations: [], trainLines: [] };
    }
    const trainRng = options.rng.fork('train');
    const entryAngle = trainRng.range(0, Math.PI * 2);
    const entry = boundaryPointAt(options.boundary, entryAngle, options.cityCenter);
    const exit = boundaryPointAt(
      options.boundary,
      entryAngle + Math.PI + trainRng.range(-0.5, 0.5),
      options.cityCenter,
    );
    const stationIsClear = (node: BuiltNode): boolean =>
      this.hasGroundConnection(node.id)
      && !(options.stationExclusion ?? []).some((polygon) => pointInPolygon(node.position, polygon));
    const mainNode = this.nearestNode(add(
      options.cityCenter,
      scale(normalize(sub(entry, options.cityCenter)), 250),
    ), stationIsClear);
    if (!stationIsClear(mainNode)) return { trainStations: [], trainLines: [] };
    const mainPos = mainNode.position;
    const secondNode = this.nearestNode(
      add(options.cityCenter, scale(normalize(sub(exit, options.cityCenter)), 400)),
      (node) => node.id !== mainNode.id && stationIsClear(node),
    );
    if (secondNode.id === mainNode.id || !stationIsClear(secondNode)) return { trainStations: [], trainLines: [] };
    const second = secondNode.position;
    const path: Polyline = [entry];
    path.push(lerpBend(entry, mainPos, trainRng), mainPos);
    path.push(lerpBend(mainPos, second, trainRng), second);
    path.push(lerpBend(second, exit, trainRng), exit);
    const trainStations: Station[] = [];
    for (const position of [mainPos, second]) {
      const along = distanceAlong(path, position);
      trainStations.push(this.makeStation(
        `ts${trainStations.length}`,
        position,
        directionAt(path, along),
        options.districtOfNode,
        LEVELS.train,
      ));
    }
    return {
      trainStations,
      trainLines: [{
        id: 'tl0',
        stationIds: trainStations.map((station) => station.id),
        path,
        underground: false,
        level: LEVELS.train,
        width: RAIL.trainWidth,
      }],
    };
  }

  private placeBusStops(
    fromId: string,
    edgeIds: string[],
    districtOfNode: (nodeId: string) => number,
    districts: PlannedDistrict[],
    cityCenter: Vec2,
    stopIndex: Map<string, BusStop[]>,
    allStops: BusStop[],
  ): string[] {
    const stopIds: string[] = [];
    let at = fromId;
    let sinceLast = Infinity; // place one near the start
    for (const id of edgeIds) {
      const edge = this.edgeById.get(id)!;
      const forward = edge.from === at;
      const path = forward ? edge.path : [...edge.path].reverse();
      const l = lineLength(path);
      const di = districtOfNode(at);
      const central = dist(this.nodeById.get(at)!.position, cityCenter) < districts[di]?.radius * 1.5;
      // researched spacing for a full-size city, closer in a small one so a short route still gets its stops
      const spacing = (central ? 320 : 460) * this.stopScale;
      let cursor = 26; // clearance from the intersection
      while (cursor < l - 26) {
        sinceLast += cursor === 26 ? 26 : 0;
        if (sinceLast >= spacing) {
          const streetSide = forward ? 'right' : 'left';
          const band = sidewalkBand(edge, streetSide, 'furnishing');
          const half = edge.width / 2;
          const side = (half + band.offset) * (forward ? -1 : 1);
          const arc = forward ? cursor : l - cursor;
          const position = offsetAt(edge.path, arc, side);
          const fromCenterline = distanceTo(edge.path, position);
          if (fromCenterline >= half - 0.5 && fromCenterline <= half + edge.sidewalk[streetSide] + 0.5) {
            const existing = (stopIndex.get(edge.id) ?? []).find((s) => dist(s.position, position) < 60);
            if (existing) {
              if (stopIds[stopIds.length - 1] !== existing.id) stopIds.push(existing.id);
              sinceLast = 0;
            } else {
              const stop: BusStop = {
                id: `bs${allStops.length}`,
                edgeId: edge.id,
                position,
                districtId: `d${districtOfNode(at)}`,
              };
              allStops.push(stop);
              (stopIndex.get(edge.id) ?? stopIndex.set(edge.id, []).get(edge.id)!).push(stop);
              stopIds.push(stop.id);
              sinceLast = 0;
            }
          }
        }
        const step = Math.min(80, l - 26 - cursor);
        if (step <= 0) break;
        cursor += step;
        sinceLast += step;
      }
      at = forward ? edge.to : edge.from;
    }
    return stopIds;
  }

  /** Grade station footprint and its sidewalk access points. */
  private makeStation(
    id: string,
    position: Vec2,
    direction: Vec2,
    districtOfNode: (nodeId: string) => number,
    level: number,
  ): Station {
    const node = this.nearestNode(position, (candidate) => this.hasGroundConnection(candidate.id));
    const entrances = this.entrancesNear(position);
    if (entrances.length === 0) throw unsatisfiable('grade station has no reachable sidewalk entrance', { id, position });
    return {
      id,
      position,
      districtId: `d${districtOfNode(node.id)}`,
      platform: platformOf(position, direction, 'train'),
      box: boxOf(level, 'train'),
      entrances,
      shafts: [],
      accessPaths: [],
      level,
    };
  }

  /**
   * Sidewalk points beside the street that runs closest to `position`, both
   * sides when both land in the band: a tight bend can push an offset point
   * back into the roadway, so every candidate is verified against its edge.
   */
  private entrancesNear(position: Vec2): Vec2[] {
    const nearby = [...this.edgeById.values()]
      .filter((edge) => edge.level === LEVELS.ground && (edge.sidewalk.left > 0 || edge.sidewalk.right > 0))
      .map((edge) => ({ edge, away: distanceTo(edge.path, position) }))
      .sort((a, b) => a.away - b.away)
      .slice(0, NEAR_EDGES);
    for (const { edge } of nearby) {
      const arc = distanceAlong(edge.path, position);
      const places: Vec2[] = [];
      for (const side of ['left', 'right'] as const) {
        const band = sidewalkBand(edge, side, 'walking');
        if (band.width <= 0) continue;
        const point = offsetAt(edge.path, arc, (edge.width / 2 + band.offset) * (side === 'left' ? 1 : -1));
        if (StreetCorridors.band(edge, side, 'walking').some((polygon) =>
          pointInPolygon(point, polygon) || distanceToOutline(point, polygon) <= 0.001)) places.push(point);
      }
      if (places.length > 0) return places;
    }
    return [];
  }

  private hasGroundConnection(nodeId: string): boolean {
    return this.adjacency.has(stateKey(nodeId, LEVELS.ground));
  }
}

/** Stable key for one physical node at one driveable elevation. */
function stateKey(nodeId: string, level: number): string {
  return `${nodeId}@${level.toFixed(9)}`;
}

/** How many of the nearest sidewalked streets a station tries before giving up on an entrance. */
const NEAR_EDGES = 8;

function boundaryPointAt(boundary: Polygon, angle: number, center: Vec2): Vec2 {
  const dir: Vec2 = [Math.cos(angle), Math.sin(angle)];
  let best: Vec2 = boundary[0];
  let bestDot = -Infinity;
  for (const p of boundary) {
    const v = sub(p, center);
    const d = (v[0] * dir[0] + v[1] * dir[1]) / Math.max(Math.hypot(v[0], v[1]), 1e-9);
    const proj = v[0] * dir[0] + v[1] * dir[1];
    const score = d * 2 + proj / 10000;
    if (score > bestDot) {
      bestDot = score;
      best = p;
    }
  }
  return best;
}

/** How far along the line a point sits: the track direction there orients its platform. */
function distanceAlong(path: Polyline, point: Vec2): number {
  let best = 0;
  let bestDistance = Infinity;
  let travelled = 0;
  for (let i = 1; i < path.length; i++) {
    const { point: on, t } = closestOnSegment(point, path[i - 1], path[i]);
    const segment = dist(path[i - 1], path[i]);
    const d = dist(point, on);
    if (d < bestDistance) {
      bestDistance = d;
      best = travelled + segment * t;
    }
    travelled += segment;
  }
  return best;
}

function lerpBend(a: Vec2, b: Vec2, rng: Rng): Vec2 {
  const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const d = sub(b, a);
  const side: Vec2 = [-d[1], d[0]];
  const f = rng.range(-0.08, 0.08);
  return [mid[0] + side[0] * f, mid[1] + side[1] * f];
}

/** The extent from which bus stop spacing is the researched full-size value. */
const FULL_SIZE_EXTENT = 1600;

/** Two regional platforms and their approaches do not fit coherently below this city extent. */
const MIN_TRAIN_CITY_EXTENT = 700;
