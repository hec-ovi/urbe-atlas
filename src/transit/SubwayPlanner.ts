import type { Polygon, Polyline, Station, StreetEdge, Vec2 } from '../../schema/blueprint';
import { invalidParams, unsatisfiable } from '../errors';
import { intersection } from '../geom/clip';
import { area, bounds, distanceToOutline, pointInPolygon } from '../geom/polygon';
import { directionAt, length as pathLength, pointAt, removeDoubleBacks } from '../geom/polyline';
import { add, dist } from '../geom/vec';
import { LEVELS } from '../levels';
import { EntranceBays } from './reservations/EntranceBays';
import type { BayPlace } from './reservations/schema';
import type { SubwayOptions, SubwayPlan, SubwayRouting } from './schema';
import { boxOf, platformOf, RAIL, STATION, stationAccessOf } from './stations';

/** Rail service and its entrance land are one plan, made before parcel demand exists. */
export class SubwayPlanner {
  constructor(private readonly edges: StreetEdge[], private readonly routing: SubwayRouting) {}

  plan(options: SubwayOptions): SubwayPlan {
    if (!Number.isFinite(options.populationEstimate) || options.populationEstimate < 0) {
      throw invalidParams('subway population estimate must be nonnegative and finite');
    }
    const lineTarget = Math.min(Math.max(Math.round(3.5 * Math.pow(options.populationEstimate / 1_000_000, 0.6)), 1), 6);
    const result: SubwayPlan = {
      subwayStations: [], subwayLines: [], subwayDemand: { populationEstimate: options.populationEstimate, lineTarget },
    };
    const bays = new EntranceBays({ edges: this.edges, boundary: options.boundary, obstacles: options.entranceObstacles });
    const districts = [...options.districts].sort((a, b) =>
      Math.atan2(a.center[1] - options.cityCenter[1], a.center[0] - options.cityCenter[0])
      - Math.atan2(b.center[1] - options.cityCenter[1], b.center[0] - options.cityCenter[0]) || a.index - b.index);
    const hub = this.routing.nearest(options.cityCenter, 3);
    const rng = options.rng.fork('subway');
    for (let line = 0; line < lineTarget; line++) {
      const first = (line * 2 + 1) % districts.length;
      const second = (first + Math.max(1, Math.floor(districts.length / 2))) % districts.length;
      const a = this.routing.nearest(add(districts[first].center, [rng.range(-100, 100), rng.range(-100, 100)]));
      const b = this.routing.nearest(add(districts[second].center, [rng.range(-100, 100), rng.range(-100, 100)]));
      const path = this.selectPath(a, b, hub.id, options.boundary, bays, options.stationExclusion ?? [], result.subwayStations);
      const stationIds = this.stations(path, result.subwayStations, bays, options);
      result.subwayLines.push({ id: `sl${result.subwayLines.length}`, stationIds, path,
        underground: true, level: LEVELS.subway, width: RAIL.subwayDiameter });
    }
    return result;
  }

  private selectPath(a: { id: string; position: Vec2 }, b: { id: string; position: Vec2 }, hubId: string,
    boundary: Polygon, bays: EntranceBays, exclusions: Polygon[], stations: Station[]): Polyline {
    const paths = new Map<string, Polyline | null>();
    const viaHub = (from: string, to: string): Polyline | null => {
      const read = (start: string, end: string): Polyline | null => {
        const key = `${start}:${end}`;
        if (!paths.has(key)) paths.set(key, this.routing.path(start, end));
        return paths.get(key)!;
      };
      const first = read(from, hubId); const last = read(hubId, to);
      return first && last ? removeDoubleBacks([...first, ...last.slice(1)], -0.999999) : null;
    };
    const enough = (path: Polyline | null): path is Polyline => {
      if (!path || pathLength(path) < STATION.subway.platformLength * 2) return false;
      const half = STATION.subway.platformLength / 2;
      const first = this.placement(path, half, half, path[0], bays, exclusions, stations);
      const last = this.placement(path, pathLength(path) - half, half, path[path.length - 1], bays, exclusions, stations);
      if (!first || !last || first.existing && first.existing.id === last.existing?.id || overlaps(first.platform, [last.platform])) return false;
      return first.places.every((place) => !overlaps(place.bay.footprint, last.places.map((other) => other.bay.footprint)));
    };
    const intended = viaHub(a.id, b.id);
    if (enough(intended)) return intended;
    const anchors = [...new Map([a, b, ...boundary.map((point) => this.routing.nearest(point))].map((node) => [node.id, node])).values()];
    const pairs = anchors.flatMap((from) => anchors.filter((to) => to.id !== from.id).map((to) => ({
      from, to, penalty: dist(from.position, a.position) + dist(to.position, b.position),
    }))).sort((left, right) => left.penalty - right.penalty || left.from.id.localeCompare(right.from.id) || left.to.id.localeCompare(right.to.id));
    for (const pair of pairs) {
      const path = viaHub(pair.from.id, pair.to.id);
      if (enough(path)) return path;
    }
    throw unsatisfiable('subway street graph cannot host two complete reachable terminal platforms');
  }

  private stations(path: Polyline, all: Station[], bays: EntranceBays, options: SubwayOptions): string[] {
    const length = pathLength(path);
    const count = Math.max(2, Math.round(length / STATION_SPACING) + 1);
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const terminal = i === 0 ? path[0] : i === count - 1 ? path[path.length - 1] : undefined;
      const half = STATION.subway.platformLength / 2;
      const desired = i === 0 ? Math.min(half, length / 2)
        : i === count - 1 ? Math.max(length - half, length / 2) : length * i / (count - 1);
      const placement = this.placement(path, desired, terminal ? half : STATION_SPACING / 3,
        terminal, bays, options.stationExclusion ?? [], all);
      if (!placement) throw unsatisfiable('subway station cannot reserve a reachable entrance bay', { stationIndex: i, desired, terminal });
      const existing = placement.existing;
      if (existing) {
        if (!ids.includes(existing.id)) ids.push(existing.id);
        continue;
      }
      const id = `ss${all.length}`;
      const node = this.routing.nearest(placement.position);
      const access = stationAccessOf(placement.places.map((place) => ({
        point: place.point, direction: place.direction, shaft: place.bay.shaft,
      })), placement.platform, LEVELS.subway);
      all.push({ id, position: placement.position, districtId: `d${options.districtOfNode(node.id)}`,
        platform: placement.platform, box: boxOf(LEVELS.subway, 'subway'),
        entrances: placement.places.map((place) => place.point), entranceBays: placement.places.map((place) => place.bay),
        ...access, level: LEVELS.subway });
      bays.reserve(placement.places.map((place) => place.bay));
      ids.push(id);
    }
    if (ids.length < 2) throw unsatisfiable('subway route requires two distinct stations');
    return ids;
  }

  private placement(path: Polyline, desired: number, slide: number, terminal: Vec2 | undefined, bays: EntranceBays, exclusions: Polygon[], all: Station[]):
    { position: Vec2; platform: Polygon; places: BayPlace[]; existing?: Station } | null {
    const total = pathLength(path);
    const offsets = [0];
    for (let step = slide / 4; step <= slide; step += slide / 4) offsets.push(-step, step);
    for (const offset of offsets) {
      const at = desired + offset;
      if (at < 0 || at > total) continue;
      const position = pointAt(path, at);
      const platform = platformOf(position, directionAt(path, at), 'subway');
      if (terminal && !covers(platform, terminal) || overlaps(platform, exclusions)) continue;
      const existing = all.find((station) => dist(station.position, position) < STATION_MERGE_RADIUS
        && covers(station.platform, position) && (!terminal || covers(station.platform, terminal)));
      if (existing) return { position: existing.position, platform: existing.platform, places: [], existing };
      const places = bays.find(position, platform);
      if (places.length > 0) return { position, platform, places };
    }
    return null;
  }
}

const STATION_SPACING = 950;
const STATION_MERGE_RADIUS = 150;

function covers(polygon: Polygon, point: Vec2): boolean {
  return pointInPolygon(point, polygon) || distanceToOutline(point, polygon) <= 1e-6;
}

function overlaps(polygon: Polygon, obstacles: Polygon[]): boolean {
  const extent = bounds(polygon);
  const nearby = obstacles.filter((other) => {
    const box = bounds(other);
    return box.min[0] < extent.max[0] && box.max[0] > extent.min[0] && box.min[1] < extent.max[1] && box.max[1] > extent.min[1];
  });
  return intersection([polygon], nearby).reduce((sum, shared) => sum + area(shared), 0) > 1e-6;
}
