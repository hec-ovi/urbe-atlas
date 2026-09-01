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
  Transit,
  Vec2,
} from '../../schema/blueprint';
import type { Rng } from '../core/rng';
import type { PlannedDistrict } from '../districts/DistrictPlanner';
import type { BuiltEdge, BuiltNode } from '../streets/Graph';
import { dist, normalize, sub, add, scale } from '../geom/vec';
import { distanceTo, length as lineLength, offsetAt, pointAt } from '../geom/polyline';
import { carriagewayWidth } from '../streets/widths';

interface Adj {
  edge: BuiltEdge;
  other: string;
  length: number;
}

/** Alleys are pedestrian: they never enter the planner's graph, and the cost keeps them out. */
const CLASS_COST: Record<StreetClass, number> = { highway: 1.4, road: 0.6, street: 1.0, alley: Infinity };

export class TransitPlanner {
  private readonly nodes: BuiltNode[];
  private readonly nodeById = new Map<string, BuiltNode>();
  private readonly edgeById = new Map<string, BuiltEdge>();
  private readonly adjacency = new Map<string, Adj[]>();
  private readonly usage = new Map<string, number>();
  private readonly sidewalkOf: (edgeId: string) => number;

  constructor(nodes: BuiltNode[], edges: BuiltEdge[], sidewalkOf: (edgeId: string) => number) {
    this.nodes = nodes;
    this.sidewalkOf = sidewalkOf;
    for (const n of nodes) this.nodeById.set(n.id, n);
    for (const e of edges) {
      this.edgeById.set(e.id, e);
      const l = lineLength(e.path);
      const fwd: Adj = { edge: e, other: e.to, length: l };
      const bwd: Adj = { edge: e, other: e.from, length: l };
      (this.adjacency.get(e.from) ?? this.adjacency.set(e.from, []).get(e.from)!).push(fwd);
      (this.adjacency.get(e.to) ?? this.adjacency.set(e.to, []).get(e.to)!).push(bwd);
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
    const distMap = new Map<string, number>();
    const prevEdge = new Map<string, string>();
    const prevNode = new Map<string, string>();
    const visited = new Set<string>();
    distMap.set(fromId, 0);
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
      if (cur === toId) break;
      visited.add(cur);
      for (const a of this.adjacency.get(cur) ?? []) {
        const worn = 1 + 0.6 * (this.usage.get(a.edge.id) ?? 0);
        const nd = curD + a.length * classCost[a.edge.class] * worn;
        const old = distMap.get(a.other);
        if (old === undefined || nd < old - 1e-9) {
          distMap.set(a.other, nd);
          prevEdge.set(a.other, a.edge.id);
          prevNode.set(a.other, cur);
        }
      }
    }
    const out: string[] = [];
    let cur = toId;
    while (cur !== fromId) {
      const e = prevEdge.get(cur);
      if (!e) return null;
      out.push(e);
      cur = prevNode.get(cur)!;
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
    rng: Rng;
  }): Transit {
    const { districts, cityCenter, population, rng } = options;
    const transit: Transit = {
      busStops: [],
      busRoutes: [],
      trainStations: [],
      trainLines: [],
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
      const from = this.nearestNode(add(da.center, [jitterA, -jitterB]));
      const to = this.nearestNode(add(db.center, [jitterB, jitterA]));
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
      const hubNode = this.nearestNode(cityCenter, (n) => (this.adjacency.get(n.id) ?? []).length >= 3);
      const subRng = rng.fork('subway');
      const subCost: Record<StreetClass, number> = { highway: 1.2, road: 0.5, street: 1.1, alley: Infinity };
      for (let l = 0; l < lineCount; l++) {
        const [da, db] = pairs[(l * 2 + 1) % pairs.length];
        const a = this.nearestNode(add(da.center, [subRng.range(-100, 100), subRng.range(-100, 100)]));
        const b = this.nearestNode(add(db.center, [subRng.range(-100, 100), subRng.range(-100, 100)]));
        const leg1 = this.shortestPath(a.id, hubNode.id, subCost);
        const leg2 = this.shortestPath(hubNode.id, b.id, subCost);
        if (!leg1 || !leg2) continue;
        const geometry = [...this.pathGeometry(a.id, leg1), ...this.pathGeometry(hubNode.id, leg2).slice(1)];
        if (geometry.length < 2) continue;
        // a line that cannot reach 2 stations is dropped, and takes the
        // stations it just created with it: no station outlives its line
        const before = transit.subwayStations.length;
        const stationIds = this.placeStations(geometry, 950, 150, transit.subwayStations, 'ss', options.districtOfNode);
        if (stationIds.length < 2) {
          transit.subwayStations.length = before;
          continue;
        }
        transit.subwayLines.push({
          id: `sl${transit.subwayLines.length}`,
          stationIds,
          path: geometry,
          underground: true,
        } satisfies RailLine);
      }
    }

    // --- train -----------------------------------------------------------
    if (options.features.trains) {
      // every line serves at least 2 stations: the main station and a second
      // one toward the exit side (through-running pattern)
      const trainRng = rng.fork('train');
      const entryAngle = trainRng.range(0, Math.PI * 2);
      const entry = boundaryPointAt(options.boundary, entryAngle, cityCenter);
      const exit = boundaryPointAt(options.boundary, entryAngle + Math.PI + trainRng.range(-0.5, 0.5), cityCenter);
      const mainNode = this.nearestNode(add(cityCenter, scale(normalize(sub(entry, cityCenter)), 250)));
      const mainPos = mainNode.position;
      const second = this.nearestNode(
        add(cityCenter, scale(normalize(sub(exit, cityCenter)), 400)),
        (n) => n.id !== mainNode.id,
      ).position;
      const path: Polyline = [entry];
      path.push(lerpBend(entry, mainPos, trainRng));
      path.push(mainPos);
      const stations: Vec2[] = [mainPos];
      path.push(lerpBend(mainPos, second, trainRng));
      path.push(second);
      stations.push(second);
      path.push(lerpBend(second, exit, trainRng));
      path.push(exit);
      const stationIds: string[] = [];
      for (const pos of stations) {
        const st = this.makeStation(`ts${transit.trainStations.length}`, pos, options.districtOfNode);
        transit.trainStations.push(st);
        stationIds.push(st.id);
      }
      transit.trainLines.push({
        id: 'tl0',
        stationIds,
        path,
        underground: false,
      } satisfies RailLine);
    }

    return transit;
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
      const spacing = central ? 320 : 460;
      let cursor = 26; // clearance from the intersection
      while (cursor < l - 26) {
        sinceLast += cursor === 26 ? 26 : 0;
        if (sinceLast >= spacing) {
          const existing = (stopIndex.get(edge.id) ?? []).find((s) => dist(s.position, pointAt(path, cursor)) < 60);
          if (existing) {
            if (stopIds[stopIds.length - 1] !== existing.id) stopIds.push(existing.id);
            sinceLast = 0;
          } else {
            const side = (carriagewayWidth(edge.class) / 2 + this.sidewalkOf(edge.id) / 2) * (forward ? -1 : 1);
            const arc = forward ? cursor : l - cursor;
            const position = offsetAt(edge.path, arc, side);
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
  ): string[] {
    const total = lineLength(geometry);
    const count = Math.max(2, Math.round(total / spacing) + 1);
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const pos = pointAt(geometry, (total * i) / (count - 1));
      const existing = all.find((s) => dist(s.position, pos) < mergeRadius);
      if (existing) {
        if (ids[ids.length - 1] !== existing.id) ids.push(existing.id);
        continue;
      }
      const st = this.makeStation(`${prefix}${all.length}`, pos, districtOfNode);
      all.push(st);
      ids.push(st.id);
    }
    return ids;
  }

  private makeStation(id: string, position: Vec2, districtOfNode: (nodeId: string) => number): Station {
    // entrances go mid-sidewalk, so anchor to the nearest node that offers one
    const node = this.nearestNode(position, (n) => this.entrancesAt(n).length > 0);
    const entrances = this.entrancesAt(node);
    return {
      id,
      position,
      districtId: `d${districtOfNode(node.id)}`,
      entrances: entrances.length > 0 ? entrances : [position],
    };
  }

  /**
   * Sidewalk points beside the node's first edge that serves them, both sides
   * when both land in the band: a tight bend can push an offset point back
   * into the roadway, so every candidate is verified against its own edge.
   */
  private entrancesAt(node: BuiltNode): Vec2[] {
    for (const a of this.adjacency.get(node.id) ?? []) {
      const sidewalk = this.sidewalkOf(a.edge.id);
      if (sidewalk <= 0) continue;
      const half = carriagewayWidth(a.edge.class) / 2;
      const l = lineLength(a.edge.path);
      const arc = Math.min(Math.max(30, l * 0.25), Math.max(l - 30, 0));
      const points: Vec2[] = [];
      for (const side of [half + sidewalk / 2, -(half + sidewalk / 2)]) {
        const p = offsetAt(a.edge.path, arc, side);
        const d = distanceTo(a.edge.path, p);
        if (d >= half - 0.4 && d <= half + sidewalk + 0.4) points.push(p);
      }
      if (points.length > 0) return points;
    }
    return [];
  }
}

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

function lerpBend(a: Vec2, b: Vec2, rng: Rng): Vec2 {
  const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const d = sub(b, a);
  const side: Vec2 = [-d[1], d[0]];
  const f = rng.range(-0.08, 0.08);
  return [mid[0] + side[0] * f, mid[1] + side[1] * f];
}
