import type { Polygon, StreetEdge, Vec2 } from '../../../schema/blueprint';
import { bufferLine, difference, snapPoint, union } from '../../geom/clip';
import { PolygonIndex } from '../../geom/PolygonIndex';
import type { SectionedStreetEdge } from './schema/sections';
import type { SidewalkBands } from './schema/design';
import type { StreetSide } from './SidewalkSection';
import { CORRIDOR_SWEEP_MODEL } from './corridors/Model';
import type { StreetPlanningReservations } from './corridors/schema';

const BAND_ORDER = CORRIDOR_SWEEP_MODEL.bandOrder;
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
    return {
      version: '1.0.0', model: this.model,
      edges: edges.map((edge) => ({
        edgeId: edge.id, roadway: roadwayOf(edge),
        sides: {
          left: { sidewalk: this.sidewalk(edge, 'left'), walking: this.band(edge, 'left', 'walking') },
          right: { sidewalk: this.sidewalk(edge, 'right'), walking: this.band(edge, 'right', 'walking') },
        },
      })),
    };
  }

  /** The complete published sidewalk on one directed side, before junction ownership. */
  static sidewalk(edge: StreetEdge, side: StreetSide): Polygon[] {
    return sweptBand(edge, side, 0, edge.sidewalk[side]);
  }

  /** One functional strip, preserving the same bent boundary as the full corridor. */
  static band(edge: SectionedStreetEdge, side: StreetSide, role: keyof SidewalkBands): Polygon[] {
    const bands = edge.crossSection?.sidewalks[side].bands;
    if (!bands) return role === 'walking' ? this.sidewalk(edge, side) : [];
    let start = 0;
    for (const name of BAND_ORDER) {
      if (name === role) return sweptBand(edge, side, start, start + bands[name]);
      start += bands[name];
    }
    return [];
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
