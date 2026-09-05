import type { Polygon, StreetEdge, Vec2 } from '../../../schema/blueprint';
import { bufferLine, difference, snapPoint, union } from '../../geom/clip';
import { PolygonIndex } from '../../geom/PolygonIndex';
import type { SectionedStreetEdge } from './schema/sections';
import type { StreetSide } from './SidewalkSection';
import { CORRIDOR_SWEEP_MODEL, EXPLICIT_CORRIDOR_SWEEP_MODEL } from './corridors/Model';
import type { StreetPlanningReservations, SidePlanningReservation, ExplicitSidePlanningReservation, CorridorBandRole } from './corridors/schema';
import { resolveSidewalkGeometry } from './SidewalkGeometry';

/** All parallel sweeps share angular stations, independent of their width. */
const ARC_STEP = CORRIDOR_SWEEP_MODEL.maximumFanStepRadians;

/** Complete rights of way, including distinct left and right pedestrian widths. */
export class StreetCorridors {
  static readonly model = CORRIDOR_SWEEP_MODEL;
  readonly roadway: Map<string, Polygon[]>;
  readonly byEdge: Map<string, Polygon[]>;
  readonly pedestrian: Polygon[];
  readonly full: Polygon[];
  readonly index: PolygonIndex;

  /** Roadway-only authority for datum queries that need no pedestrian ownership. */
  static roadwayFor(edge: StreetEdge): Polygon[] { return roadwayOf(edge); }

  constructor(edges: readonly StreetEdge[]) {
    this.roadway = new Map(edges.filter((edge) => edge.width > 0).map((edge) => [edge.id, roadwayOf(edge)]));
    this.byEdge = new Map(edges.map((edge) => [edge.id, edge.class === 'highway'
      ? this.roadway.get(edge.id)!
      : corridor(edge.path, edge.width / 2 + edge.sidewalk.left, edge.width / 2 + edge.sidewalk.right),
    ]));
    this.full = [...this.byEdge.values()].flat();
    this.pedestrian = edges.filter((edge) => edge.width === 0).flatMap((edge) => corridor(edge.path, edge.sidewalk.left, edge.sidewalk.right));
    this.index = new PolygonIndex(this.full);
  }

  /** Exact edge-local planning data; final ground retains junction ownership. */
  static reservations(edges: readonly SectionedStreetEdge[]): StreetPlanningReservations {
    const explicit = edges.some((edge) => edge.crossSection?.sidewalks.left.geometry || edge.crossSection?.sidewalks.right.geometry);
    const side = (edge: SectionedStreetEdge, name: StreetSide): SidePlanningReservation | ExplicitSidePlanningReservation => {
      const common = { sidewalk: this.sidewalk(edge, name), walking: this.band(edge, name, 'walking') };
      if (!explicit) return common;
      const section = edge.crossSection?.sidewalks[name];
      const geometry = section ? section.geometry ?? resolveSidewalkGeometry(section.bands) : undefined;
      const start = geometry?.intervals.find((part) => part.role === 'curb')?.end ?? 0;
      return { ...common, paved: sweptBand(edge, name, start, geometry?.totalWidth ?? edge.sidewalk[name]), bands: {
        'gutter-lip': this.band(edge, name, 'gutter-lip'), gutter: this.band(edge, name, 'gutter'),
        curb: this.band(edge, name, 'curb'), border: this.band(edge, name, 'border'),
        furnishing: this.band(edge, name, 'furnishing'), frontage: this.band(edge, name, 'frontage'),
      } };
    };
    return {
      version: explicit ? '1.1.0' : '1.0.0', model: explicit ? EXPLICIT_CORRIDOR_SWEEP_MODEL : this.model,
      edges: edges.map((edge) => ({
        edgeId: edge.id, roadway: roadwayOf(edge),
        sides: {
          left: side(edge, 'left'), right: side(edge, 'right'),
        },
      })),
    };
  }

  /** The complete published sidewalk on one directed side, before junction ownership. */
  static sidewalk(edge: StreetEdge, side: StreetSide): Polygon[] {
    return sweptBand(edge, side, 0, edge.sidewalk[side]);
  }

  /** One functional strip, preserving the same bent boundary as the full corridor. */
  static band(edge: SectionedStreetEdge, side: StreetSide, role: CorridorBandRole): Polygon[] {
    const section = edge.crossSection?.sidewalks[side];
    if (!section) return role === 'walking' ? this.sidewalk(edge, side) : [];
    const interval = (section.geometry ?? resolveSidewalkGeometry(section.bands)).intervals.find((part) => part.role === role);
    return interval ? sweptBand(edge, side, interval.start, interval.end) : [];
  }
}

function roadwayOf(edge: StreetEdge): Polygon[] {
  if (edge.width <= 0) return [];
  return edge.class === 'highway' ? bufferLine(edge.path, edge.width) : corridor(edge.path, edge.width / 2, edge.width / 2);
}

function sweptBand(edge: StreetEdge, side: StreetSide, start: number, end: number): Polygon[] {
  if (end <= start) return [];
  const sign = side === 'left' ? 1 : -1;
  return difference(
    union(halfCorridor(edge.path, edge.width / 2 + end, sign)),
    union(halfCorridor(edge.path, edge.width / 2 + start, sign)),
  );
}

/** Independent one-sided sweeps retain unequal widths through bends. */
function corridor(path: Vec2[], left: number, right: number): Polygon[] {
  return union([...halfCorridor(path, left, 1), ...halfCorridor(path, right, -1)]);
}

function halfCorridor(path: Vec2[], width: number, side: 1 | -1): Polygon[] {
  if (width <= 0) return [];
  const polygons: Polygon[] = [];
  const normals: Vec2[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]; const b = path[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const normal: Vec2 = [-(b[1] - a[1]) / length * side, (b[0] - a[0]) / length * side];
    normals.push(normal);
    const p: Polygon = [a, b, shift(b, normal, width), shift(a, normal, width)];
    polygons.push(side > 0 ? p : p.reverse());
  }
  for (let i = 1; i < path.length - 1; i++) {
    polygons.push(fan(path[i], normals[i - 1], normals[i], width));
  }
  const first = normals[0]; const last = normals[normals.length - 1];
  const start: Vec2 = [-first[1] * side, first[0] * side];
  const end: Vec2 = [last[1] * side, -last[0] * side];
  polygons.push(fan(path[0], start, first, width), fan(path[path.length - 1], last, end, width));
  return polygons;
}

function shift(point: Vec2, direction: Vec2, distance: number): Vec2 {
  return snapPoint([point[0] + direction[0] * distance, point[1] + direction[1] * distance]);
}

function fan(center: Vec2, from: Vec2, to: Vec2, radius: number): Polygon {
  let angle = Math.atan2(to[1], to[0]) - Math.atan2(from[1], from[0]);
  if (angle > Math.PI) angle -= Math.PI * 2;
  if (angle < -Math.PI) angle += Math.PI * 2;
  const first = Math.atan2(from[1], from[0]);
  const count = Math.max(1, Math.ceil(Math.abs(angle) / ARC_STEP));
  const ring: Polygon = [center, ...Array.from({ length: count + 1 }, (_, index) => {
    const at = first + angle * index / count;
    return shift(center, [Math.cos(at), Math.sin(at)], radius);
  })];
  return angle < 0 ? ring.reverse() : ring;
}
