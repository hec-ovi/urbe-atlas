import type { Polygon, Vec2 } from '../../../schema/blueprint';
import { difference, intersection, snap } from '../../geom/clip';
import { area, bounds, distanceToOutline, pointInPolygon } from '../../geom/polygon';
import { PolygonIndex } from '../../geom/PolygonIndex';
import { directionAt, length as pathLength, pointAt } from '../../geom/polyline';
import { closestOnSegment, dist } from '../../geom/vec';
import { LEVELS } from '../../levels';
import { StreetCorridors } from '../../streets/construction/StreetCorridors';
import type { StreetSide } from '../../streets/construction/SidewalkSection';
import type { SectionedStreetEdge } from '../../streets/construction/schema/sections';
import { STATION } from '../stations';
import { BAY_APRON, BAY_LENGTH, bayAt, bayCenter } from './BayGeometry';
import type { BayPlace, EntranceBay, EntranceBayInput } from './schema';

interface Candidate {
  edge: SectionedStreetEdge;
  side: StreetSide;
  distance: number;
  centerline: Vec2;
  direction: Vec2;
  center: Vec2;
}

/** Fits complete station bays into unassigned land beside the pedestrian right of way. */
export class EntranceBays {
  private readonly edges;
  private readonly boundary;
  private readonly unavailable;
  private readonly corridors;
  private readonly roadways;
  private readonly reserved: Polygon[] = [];
  private readonly walking = new Map<string, Polygon[]>();

  constructor(input: EntranceBayInput) {
    this.edges = input.edges.filter((edge) => edge.level === LEVELS.ground && (edge.class === 'street' || edge.class === 'road'));
    this.boundary = input.boundary;
    this.unavailable = new PolygonIndex(input.obstacles);
    this.corridors = new StreetCorridors(input.edges);
    this.roadways = new PolygonIndex([...this.corridors.roadway.values()].flat());
  }

  find(position: Vec2, platform: Polygon): BayPlace[] {
    const candidates = this.edges.flatMap((edge) => this.candidates(edge, position, platform));
    candidates.sort((a, b) => dist(a.center, position) - dist(b.center, position)
      || a.edge.id.localeCompare(b.edge.id)
      || a.side.localeCompare(b.side)
      || a.distance - b.distance);
    const places: BayPlace[] = [];
    for (const candidate of candidates) {
      const first = places[0];
      if (first && (candidate.edge.id !== first.bay.edgeId || candidate.side === first.bay.side)) continue;
      const place = bayAt(candidate.edge, candidate.side, candidate.centerline, candidate.direction, candidate.distance);
      if (!this.fits(place, candidate.edge) || first && overlaps(place.bay.footprint, [first.bay.footprint])) continue;
      places.push(place);
      if (places.length === 2) break;
    }
    return places;
  }

  reserve(bays: readonly EntranceBay[]): void {
    this.reserved.push(...bays.map((bay) => bay.footprint));
  }

  private candidates(edge: SectionedStreetEdge, position: Vec2, platform: Polygon): Candidate[] {
    const extent = bounds(platform);
    const near = (point: Vec2): boolean => point[0] >= extent.min[0] - STATION.maxPassage - BAY_LENGTH
      && point[0] <= extent.max[0] + STATION.maxPassage + BAY_LENGTH
      && point[1] >= extent.min[1] - STATION.maxPassage - BAY_LENGTH
      && point[1] <= extent.max[1] + STATION.maxPassage + BAY_LENGTH;
    const total = pathLength(edge.path);
    const arcs = new Set<number>();
    let travelled = 0;
    for (let i = 1; i < edge.path.length; i++) {
      const start = edge.path[i - 1]; const end = edge.path[i];
      const length = dist(start, end);
      const nearest = closestOnSegment(position, start, end);
      if (near(nearest.point) || near(start) || near(end)) {
        arcs.add(snap(Math.max(BAY_LENGTH / 2, Math.min(total - BAY_LENGTH / 2, travelled + nearest.t * length))));
        for (let at = Math.max(BAY_LENGTH / 2, Math.ceil(travelled / BAY_APRON) * BAY_APRON);
          at <= Math.min(total - BAY_LENGTH / 2, travelled + length); at += BAY_APRON) arcs.add(snap(at));
      }
      travelled += length;
    }
    const out: Candidate[] = [];
    for (const along of arcs) {
      if (along < BAY_LENGTH / 2 || along > total - BAY_LENGTH / 2) continue;
      const centerline = pointAt(edge.path, along);
      if (!near(centerline)) continue;
      for (const side of ['left', 'right'] as const) {
        if (edge.sidewalk[side] <= 0) continue;
        const direction = directionAt(edge.path, along);
        const center = bayCenter(edge, side, centerline, direction);
        const reach = pointInPolygon(center, platform) ? 0 : distanceToOutline(center, platform);
        if (reach > STATION.maxPassage) continue;
        out.push({ edge, side, distance: along, centerline, direction, center });
      }
    }
    return out;
  }

  private fits({ bay }: BayPlace, edge: SectionedStreetEdge): boolean {
    const key = `${edge.id}:${bay.side}`;
    if (!this.walking.has(key)) this.walking.set(key, StreetCorridors.band(edge, bay.side, 'walking'));
    const connection = bay.approach[0];
    return this.walking.get(key)!.some((polygon) => pointInPolygon(connection, polygon) || distanceToOutline(connection, polygon) <= 0.001)
      && difference([bay.footprint], [this.boundary]).reduce((sum, polygon) => sum + area(polygon), 0) <= AREA_EPS
      && !overlaps(bay.footprint, this.unavailable.near(bay.footprint))
      && !overlaps(bay.footprint, this.reserved)
      && !overlaps(bay.footprint, this.roadways.near(bay.footprint))
      && !overlaps(bay.shaft, this.corridors.index.near(bay.shaft));
  }
}

const AREA_EPS = 1e-6;

function overlaps(polygon: Polygon, others: Polygon[]): boolean {
  return intersection([polygon], others).reduce((sum, shared) => sum + area(shared), 0) > AREA_EPS;
}
