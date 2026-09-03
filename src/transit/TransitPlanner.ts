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
  RailLine,
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
import { directionAt, distanceTo, length as lineLength, offsetAt, pointAt, removeDoubleBacks } from '../geom/polyline';
import { type EntrancePlace, RAIL, STATION, boxOf, platformOf, rectangle, stationAccessOf } from './stations';
import { carriagewayWidth } from '../streets/widths';
import { LEVELS } from '../levels';
import { area, bounds, distanceToOutline, pointInPolygon } from '../geom/polygon';
import { intersection } from '../geom/clip';

interface Adj {
  edge: StreetEdge;
  /** Logical node key, including its endpoint elevation. */
  other: string;
  length: number;
}

/** Alleys are pedestrian: they never enter the planner's graph, and the cost keeps them out. */
const CLASS_COST: Record<StreetClass, number> = { highway: 1.4, road: 0.6, street: 1.0, alley: Infinity };

export type TrainPlan = Pick<Transit, 'trainStations' | 'trainLines'>;

export class TransitPlanner {
  /** 1 in a city 1.6 km across or larger; smaller cities space their bus stops closer, in proportion. */
  private stopScale = 1;
  private readonly nodes: BuiltNode[];
  private readonly nodeById = new Map<string, BuiltNode>();
  private readonly edgeById = new Map<string, StreetEdge>();
  private readonly adjacency = new Map<string, Adj[]>();
  private readonly usage = new Map<string, number>();
  private readonly sidewalkOf: (edgeId: string) => number;

  constructor(nodes: BuiltNode[], edges: StreetEdge[], sidewalkOf: (edgeId: string) => number) {
    this.nodes = nodes;
    this.sidewalkOf = sidewalkOf;
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

  plan(options: {
    districts: PlannedDistrict[];
    districtOfNode: (nodeId: string) => number;
    cityCenter: Vec2;
    boundary: Polygon;
    population: number;
    anchors: Vec2[];
    features: { trains: boolean; subways: boolean };
    trainPlan?: TrainPlan;
    entranceObstacles?: Polygon[];
    stationExclusion?: Polygon[];
    rng: Rng;
  }): Transit {
    const { districts, cityCenter, population, rng } = options;
    const extent = bounds(options.boundary);
    this.stopScale = Math.min(1, Math.min(extent.max[0] - extent.min[0], extent.max[1] - extent.min[1]) / FULL_SIZE_EXTENT);
    const transit: Transit = {
      busStops: [],
      busRoutes: [],
      trainStations: options.trainPlan?.trainStations ?? [],
      trainLines: options.trainPlan?.trainLines ?? [],
      subwayStations: [],
      subwayLines: [],
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

    // --- subway ----------------------------------------------------------
    if (options.features.subways) {
      const lineCount = Math.min(Math.max(Math.round(3.5 * Math.pow(population / 1_000_000, 0.6)), 1), 6);
      const hubNode = this.nearestNode(cityCenter, (n) =>
        (this.adjacency.get(stateKey(n.id, LEVELS.ground)) ?? []).length >= 3);
      const subRng = rng.fork('subway');
      const subCost: Record<StreetClass, number> = { highway: 1.2, road: 0.5, street: 1.1, alley: Infinity };
      for (let l = 0; l < lineCount; l++) {
        const [da, db] = pairs[(l * 2 + 1) % pairs.length];
        const a = this.nearestNode(
          add(da.center, [subRng.range(-100, 100), subRng.range(-100, 100)]),
          (node) => this.hasGroundConnection(node.id),
        );
        const b = this.nearestNode(
          add(db.center, [subRng.range(-100, 100), subRng.range(-100, 100)]),
          (node) => this.hasGroundConnection(node.id),
        );
        const leg1 = this.shortestPath(a.id, hubNode.id, subCost);
        const leg2 = this.shortestPath(hubNode.id, b.id, subCost);
        if (!leg1 || !leg2) continue;
        const geometry = removeDoubleBacks(
          [...this.pathGeometry(a.id, leg1), ...this.pathGeometry(hubNode.id, leg2).slice(1)],
          -0.999999,
        );
        if (geometry.length < 2) continue;
        // a line that cannot reach 2 stations is dropped, and takes the
        // stations it just created with it: no station outlives its line
        const before = transit.subwayStations.length;
        const stationIds = this.placeStations(
          geometry,
          950,
          150,
          transit.subwayStations,
          'ss',
          options.districtOfNode,
          LEVELS.subway,
          options.entranceObstacles ?? [],
          options.stationExclusion ?? [],
        );
        if (stationIds.length < 2) {
          transit.subwayStations.length = before;
          continue;
        }
        transit.subwayLines.push({
          id: `sl${transit.subwayLines.length}`,
          stationIds,
          path: geometry,
          underground: true,
          level: LEVELS.subway,
          width: RAIL.subwayDiameter,
        } satisfies RailLine);
      }
    }

    // --- train -----------------------------------------------------------
    if (options.features.trains && !options.trainPlan) {
      const train = this.planTrain(options);
      transit.trainStations.push(...train.trainStations);
      transit.trainLines.push(...train.trainLines);
    }

    return transit;
  }

  /**
   * Plans the grade-level railway before parcels are cut, so its exact track
   * bed and platform footprints can be reserved as one right-of-way.
   */
  planTrain(options: {
    districtOfNode: (nodeId: string) => number;
    cityCenter: Vec2;
    boundary: Polygon;
    stationExclusion?: Polygon[];
    rng: Rng;
  }): TrainPlan {
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
          const sidewalk = this.sidewalkOf(edge.id);
          const half = carriagewayWidth(edge.class) / 2;
          const side = (half + sidewalk / 2) * (forward ? -1 : 1);
          const arc = forward ? cursor : l - cursor;
          const position = offsetAt(edge.path, arc, side);
          const fromCenterline = distanceTo(edge.path, position);
          if (fromCenterline >= half - 0.5 && fromCenterline <= half + sidewalk + 0.5) {
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

  private placeStations(
    geometry: Polyline,
    spacing: number,
    mergeRadius: number,
    all: Station[],
    prefix: 'ss' | 'ts',
    districtOfNode: (nodeId: string) => number,
    level: number,
    entranceObstacles: Polygon[],
    stationExclusion: Polygon[],
  ): string[] {
    const total = lineLength(geometry);
    const count = Math.max(2, Math.round(total / spacing) + 1);
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const terminal = i === 0 ? geometry[0] : i === count - 1 ? geometry[geometry.length - 1] : null;
      const platformHalf = STATION.subway.platformLength / 2;
      const desired = i === 0
        ? Math.min(platformHalf, total / 2)
        : i === count - 1
          ? Math.max(total - platformHalf, total / 2)
          : (total * i) / (count - 1);
      const placed = this.enterablePoint(
        geometry,
        desired,
        terminal ? platformHalf : spacing / 3,
        entranceObstacles,
        (candidate) => !hitsAny(
          platformOf(candidate.point, directionAt(geometry, candidate.along), 'subway'),
          stationExclusion,
        ) && (terminal
          ? covers(
            platformOf(candidate.point, directionAt(geometry, candidate.along), 'subway'),
            terminal,
          )
          : true),
      );
      if (!placed) continue; // nowhere along here that a street can reach: no station
      const existing = terminal ? undefined : all.find((s) => dist(s.position, placed.point) < mergeRadius);
      if (existing) {
        if (ids[ids.length - 1] !== existing.id) ids.push(existing.id);
        continue;
      }
      const st = this.makeStation(
        `${prefix}${all.length}`,
        placed.point,
        directionAt(geometry, placed.along),
        districtOfNode,
        level,
        entranceObstacles,
      );
      all.push(st);
      ids.push(st.id);
    }
    return ids;
  }

  /**
   * A station goes where the street can reach it. The sampled point wins when
   * its sidewalk is within a passage's length; otherwise the search slides
   * along the line either way, and gives up rather than leave a platform
   * nobody can enter.
   */
  private enterablePoint(
    geometry: Polyline,
    along: number,
    slide: number,
    entranceObstacles: Polygon[],
    accepts: (candidate: { point: Vec2; along: number }) => boolean = () => true,
  ): { point: Vec2; along: number } | null {
    const total = lineLength(geometry);
    const reach = (p: Vec2): number => {
      const places = this.entrancesNear(p, entranceObstacles);
      return places.length === 0 ? Infinity : Math.min(...places.map((e) => dist(e.point, p)));
    };
    const offsets = [0];
    for (let step = slide / 4; step <= slide; step += slide / 4) offsets.push(-step, step);
    for (const offset of offsets) {
      const at = along + offset;
      if (at < 0 || at > total) continue;
      const p = pointAt(geometry, at);
      const candidate = { point: p, along: at };
      if (reach(p) <= STATION.maxPassage && accepts(candidate)) return candidate;
    }
    return null;
  }

  /**
   * A station is a platform box along its track, entered from the sidewalk:
   * underground, each entrance gets a shaft down to the platform.
   */
  private makeStation(
    id: string,
    position: Vec2,
    direction: Vec2,
    districtOfNode: (nodeId: string) => number,
    level: number,
    entranceObstacles: Polygon[] = [],
  ): Station {
    // an entrance stands on the sidewalk beside the platform, so the walk down is short
    const node = this.nearestNode(position, (candidate) => this.hasGroundConnection(candidate.id));
    const places = this.entrancesNear(position, level < LEVELS.ground ? entranceObstacles : []);
    const fallback: EntrancePlace[] = [{ point: position, direction, sidewalk: 0 }];
    const entrances = places.length > 0 ? places : fallback;
    const mode = level < LEVELS.ground ? 'subway' : 'train';
    const platform = platformOf(position, direction, mode);
    const access = stationAccessOf(entrances, platform, level);
    return {
      id,
      position,
      districtId: `d${districtOfNode(node.id)}`,
      platform,
      box: boxOf(level, mode),
      entrances: entrances.map((e) => e.point),
      shafts: access.shafts,
      accessPaths: access.accessPaths,
      level,
    };
  }

  /**
   * Sidewalk points beside the street that runs closest to `position`, both
   * sides when both land in the band: a tight bend can push an offset point
   * back into the roadway, so every candidate is verified against its edge.
   */
  private entrancesNear(position: Vec2, obstacles: Polygon[] = []): EntrancePlace[] {
    const nearby = [...this.edgeById.values()]
      .filter((e) => this.sidewalkOf(e.id) > 0)
      .map((edge) => ({ edge, away: distanceTo(edge.path, position) }))
      .sort((a, b) => a.away - b.away)
      .slice(0, NEAR_EDGES);
    for (const { edge } of nearby) {
      const sidewalk = this.sidewalkOf(edge.id);
      const half = carriagewayWidth(edge.class) / 2;
      const arc = distanceAlong(edge.path, position);
      const places: EntrancePlace[] = [];
      for (const side of [half + sidewalk / 2, -(half + sidewalk / 2)]) {
        const p = offsetAt(edge.path, arc, side);
        const d = distanceTo(edge.path, p);
        if (d >= half - 0.4 && d <= half + sidewalk + 0.4) {
          places.push({ point: p, direction: directionAt(edge.path, arc), sidewalk });
        }
      }
      const clear = obstacles.length === 0
        ? places
        : places.filter((place) => {
            const width = Math.min(STATION.shaft.maxWidth, Math.max(STATION.shaft.minWidth, place.sidewalk - 0.3));
            const footprint = rectangle(place.point, place.direction, STATION.shaft.length, width);
            return !hitsAny(footprint, obstacles);
          });
      if (clear.length > 0) return clear;
    }
    return [];
  }

  private hasGroundConnection(nodeId: string): boolean {
    return this.adjacency.has(stateKey(nodeId, LEVELS.ground));
  }
}

/** Boundary points count as covered: line termini land on the platform end face. */
function covers(polygon: Polygon, point: Vec2): boolean {
  return pointInPolygon(point, polygon) || distanceToOutline(point, polygon) <= 1e-6;
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

function hitsAny(subject: Polygon, obstacles: readonly Polygon[]): boolean {
  const box = bounds(subject);
  const nearby = obstacles.filter((polygon) => {
    const other = bounds(polygon);
    return other.min[0] < box.max[0] && other.max[0] > box.min[0]
      && other.min[1] < box.max[1] && other.max[1] > box.min[1];
  });
  return nearby.length > 0
    && intersection([subject], nearby).reduce((sum, polygon) => sum + area(polygon), 0) > 1e-6;
}
