import type { CrossingSegment, GroundSurface, Polygon, StreetConnection, StreetEdge, StreetNode, Vec2 } from '../schema/blueprint';
import { CityCrossingGround, type CityCrossingRegion } from './CityCrossingGround';
import { invariantFailure, invalidParams } from './errors';
import { sidewalkBand } from './streets/construction/SidewalkSection';
import type { CrossingPlan, CrossingValidationPlan, JunctionApproach } from './streets/crossings/schema';
import type { Degradations } from './report/Degradations';

export interface CityCrossingLandExclusions {
  water: readonly Polygon[];
  /** Original block identities and boundaries, before retained blocks are renumbered. */
  blocks: readonly { ownerId: string; boundary: Polygon }[];
}

export interface CityCrossingInput {
  nodes: readonly StreetNode[];
  edges: readonly StreetEdge[];
  ground: readonly GroundSurface[];
  /** Physical footprints within the configured pedestrian headroom, including highway ramps and supports. */
  obstacles?: readonly Polygon[];
  /** Water and complete source blocks removed by water, independent of final ground coverage. */
  landExclusions?: CityCrossingLandExclusions;
  /** Collects arms that lost their crossing or their whole junction box. */
  report?: Degradations;
}

const WIDTH = 3;
const HALF = WIDTH / 2;
const PAINT_CLEARANCE = 0.05;

/**
 * Street construction closes a run with 8, 4 and 2 m pieces, so the clear
 * street between two junction boxes is a whole number of 2 m units. Every
 * junction box ends on this grid, measured from the edge start; an end with no
 * box leaves the edge's own end on it.
 */
const STATION_GRID = 2;

/** Published grid: dimensions are exact to the millimetre. */
const millimetres = (value: number): number => Math.round(value * 1000) / 1000;

/** Where on the grid a length sits, in [0, STATION_GRID). */
const gridResidue = (value: number): number => millimetres(value - Math.floor(value / STATION_GRID) * STATION_GRID);

/** Smallest setback at or beyond `least` that lands the junction box on the grid. */
const onStationGrid = (least: number, residue: number): number =>
  millimetres(residue + Math.ceil(millimetres(least - residue) / STATION_GRID) * STATION_GRID);

/** What one planning pass shares: the graph, its frames and the fields it tests against. */
interface CrossingField {
  edges: Map<string, StreetEdge>;
  frames: Map<string, StreetFrame>;
  nodes: StreetNode[];
  ground: CityCrossingGround;
  excluded: ReturnType<typeof CityCrossingGround.landExclusions>;
  traffic: CityCrossingGround;
}

/** Junction boxes an edge keeps, by end. */
type BoxedEnds = Map<string, { from: boolean; to: boolean }>;

/** Direct crossing placement for grid streets and declared-angle block cuts. */
export class CityCrossings {
  /**
   * Where one arm's box lands depends on whether the opposite end keeps one, so
   * the first pass assumes every eligible arm does and the second places them
   * against what survived.
   */
  static plan(input: CityCrossingInput): CrossingPlan {
    const field = this.field(input);
    const eligible: BoxedEnds = new Map();
    for (const node of field.nodes) {
      for (const connection of node.connections) {
        for (const edge of this.arms(node, connection, field.edges)) {
          const ends = eligible.get(edge.id) ?? { from: false, to: false };
          ends[edge.from === node.id ? 'from' : 'to'] = true;
          eligible.set(edge.id, ends);
        }
      }
    }
    return this.attempt(field, this.boxedEnds(this.attempt(field, eligible), field.edges), input.report);
  }

  /** Junction box ends a finished pass published, by edge. */
  private static boxedEnds(plan: CrossingPlan, edges: ReadonlyMap<string, StreetEdge>): BoxedEnds {
    const boxed: BoxedEnds = new Map();
    for (const approach of plan.junctions.flatMap(junction => junction.approaches)) {
      const ends = boxed.get(approach.edgeId) ?? { from: false, to: false };
      ends[edges.get(approach.edgeId)!.from === approach.nodeId ? 'from' : 'to'] = true;
      boxed.set(approach.edgeId, ends);
    }
    return boxed;
  }

  private static field(input: CityCrossingInput): CrossingField {
    const edges = new Map(input.edges.map(edge => [edge.id, edge]));
    const frames = new Map(input.edges.map(edge => [edge.id, new StreetFrame(edge)]));
    const traffic = new CityCrossingGround(input.edges.flatMap(edge => {
      const frame = frames.get(edge.id)!;
      return edge.elevationProfile.flatMap((end, index, knots): CityCrossingRegion[] => {
        const start = knots[index - 1];
        return start && start.level === 0 && end.level === 0 && edge.width > 0
          ? [{ surface: 'roadway', polygon: frame.rectangle((start.distance + end.distance) / 2,
            [-edge.width / 2, edge.width / 2], end.distance - start.distance), bottom: -0.2, top: 0, edgeId: edge.id }]
          : [];
      });
    }), []);
    return { edges, frames, traffic, nodes: [...input.nodes].sort((a, b) => a.id.localeCompare(b.id)),
      ground: new CityCrossingGround(input.ground, input.obstacles ?? []),
      excluded: CityCrossingGround.landExclusions(input.landExclusions) };
  }

  private static attempt(field: CrossingField, boxed: BoxedEnds, report?: Degradations): CrossingPlan {
    const { edges, frames, nodes, ground, excluded, traffic } = field;
    const plan: CrossingPlan = { crossings: [], junctions: [] };
    const occupied = new Map<string, [number, number][]>();
    for (const node of nodes) {
      node.connections.forEach((connection, index) => {
        const arms = this.arms(node, connection, edges);
        if (!arms.length) return;
        const groupId = `${node.id}:connection:${index}`;
        const junction = { id: `cj${plan.junctions.length}`, groupIds: [groupId], nodeIds: [node.id],
          internalEdgeIds: [], approaches: [] as JunctionApproach[] };
        const crossing = { nodeId: node.id, junctionId: junction.id, segments: [] as CrossingSegment[] };
        for (const edge of arms) {
          const frame = frames.get(edge.id)!;
          const left = sidewalkBand(edge, 'left', 'walking'), right = sidewalkBand(edge, 'right', 'walking');
          const lateral = edge.width / 2 + Math.max(left.offset + left.width / 4, right.offset + right.width / 4);
          const offsets = node.edgeIds.filter(id => id !== edge.id).map(id => {
            const other = edges.get(id), direction = frames.get(id)?.direction;
            if (!other || !direction) throw invalidParams('grid crossing node references a missing edge', { nodeId: node.id });
            const sine = Math.abs(direction[0] * frame.direction[1] - direction[1] * frame.direction[0]);
            if (sine < 1e-10) return 0;
            const cosine = Math.abs(direction[0] * frame.direction[0] + direction[1] * frame.direction[1]);
            const rim = Math.max(...Object.values(other.crossSection?.sidewalks ?? {}).map(side =>
              side.bands.curb + (side.geometry?.edge.gutter.width ?? 0.3)), 0.5);
            const radius = Object.values(other.crossSection?.sidewalks ?? {}).some(side => Math.abs((side.geometry?.pavedWidth ?? 0) - 4.2) < 1e-8) ? 4.2 : 2;
            return (other.width / 2 + radius + rim + cosine * lateral) / sine;
          });
          const starts = edge.from === node.id;
          // The far side of the field is the junction box boundary: the whole
          // field clears every other arm, then steps out to the 2 m grid.
          const clearance = Math.max(0, ...offsets) + WIDTH;
          // Boxes at both ends measure from the edge start; a bare end measures from the edge end.
          const residue = starts && boxed.get(edge.id)?.to ? 0 : gridResidue(frame.length);
          const setback = onStationGrid(clearance, residue);
          const distance = starts ? setback - HALF : frame.length - setback + HALF;
          const { approach, segment } = this.candidate(edge, frame, node.id, groupId, distance);
          const marked = [...Object.values(approach.landings), ...Object.values(approach.walkingLandings)];
          const id = `${node.id}:${edge.id}`;
          // The box is the field on this arm's own grade carriageway. Without it the arm has no junction.
          const box = distance >= HALF && distance <= frame.length - HALF
            && !occupied.get(edge.id)?.some(([a, b]) => a < approach.station[1] && b > approach.station[0])
            && excluded.clear(approach.field) && ground.covers(approach.field, ['roadway'])
            && ground.clear(approach.field) && traffic.avoidsOtherRoads(approach.field, edge.id);
          if (!box) {
            report?.add('junction-box', id, 'arm has no clear grade carriageway for a junction box');
            continue;
          }
          occupied.set(edge.id, [...(occupied.get(edge.id) ?? []), approach.station]);
          junction.approaches.push(approach);
          // Markings need complete pedestrian land on both sides; without it the box carries no crossing.
          const walkable = marked.every(polygon => excluded.clear(polygon) && ground.clear(polygon)
            && traffic.avoidsOtherRoads(polygon, edge.id))
            && Object.values(approach.landings).every(polygon => ground.covers(polygon, ['roadway', 'gutter', 'curb', 'sidewalk']))
            && Object.values(approach.walkingLandings).every(polygon => ground.covers(polygon, ['sidewalk']));
          if (!walkable) {
            report?.add('crossing', id, 'junction box has no complete paved landing on both sides');
            continue;
          }
          crossing.segments.push(segment);
        }
        if (junction.approaches.length) plan.junctions.push(junction);
        if (crossing.segments.length) plan.crossings.push(crossing);
      });
    }
    return plan;
  }

  static validate(input: CityCrossingInput, plan: CrossingValidationPlan): void {
    let expected: CrossingPlan;
    try { expected = this.plan({ ...input, report: undefined }); }
    catch (error) {
      throw invariantFailure('saved grid crossing ground is incomplete', { reason: error instanceof Error ? error.message : String(error) });
    }
    if (!equal(expected, plan)) throw invariantFailure('saved grid crossings differ from their required module approaches');
  }

  /**
   * Arms of one connection group that take a junction box: every grade
   * carriageway with walking land on both sides, once the group is a junction
   * rather than a level crossing or a run continuing through.
   */
  private static arms(node: StreetNode, connection: StreetConnection, edges: ReadonlyMap<string, StreetEdge>): StreetEdge[] {
    if (connection.level !== 0) return [];
    const incident = connection.edgeIds.map(id => {
      const edge = edges.get(id);
      if (!edge || (edge.from !== node.id && edge.to !== node.id)) throw invalidParams('grid crossing has an invalid incident edge', { nodeId: node.id, edgeId: id });
      return edge;
    });
    const motor = incident.filter(edge => edge.width > 0);
    const continuation = motor.length === 2 && motor[0].crossSection?.runId !== undefined
      && motor[0].crossSection.runId === motor[1].crossSection?.runId;
    if (motor.length === 0 || incident.length < 2 || (incident.length === 2 && continuation)) return [];
    return motor.filter(edge => edge.class !== 'highway' && edge.class !== 'alley'
      && edge.sidewalk.left > 0 && edge.sidewalk.right > 0 && edge.elevationProfile.every(knot => knot.level === 0))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  private static candidate(edge: StreetEdge, frame: StreetFrame, nodeId: string, groupId: string, distance: number) {
    const roadHalf = edge.width / 2, half = roadHalf - PAINT_CLEARANCE;
    const leftBand = sidewalkBand(edge, 'left', 'walking'), rightBand = sidewalkBand(edge, 'right', 'walking');
    if (!(leftBand.width > 0) || !(rightBand.width > 0)) throw invalidParams('grid crossing requires two positive walking bands', { edgeId: edge.id });
    const left = roadHalf + leftBand.offset, right = roadHalf + rightBand.offset;
    const field = frame.rectangle(distance, [-half, half]);
    const starts = edge.from === nodeId;
    const approach: JunctionApproach = {
      nodeId, groupId, edgeId: edge.id, distance, station: [distance - HALF, distance + HALF], field,
      landings: { left: frame.rectangle(distance, [half, left]), right: frame.rectangle(distance, [-right, -half]) },
      walkingLandings: { left: frame.rectangle(distance, [left - leftBand.width / 4, left + leftBand.width / 4]),
        right: frame.rectangle(distance, [-right - rightBand.width / 4, -right + rightBand.width / 4]) },
      cut: { left: field[starts ? 3 : 2], right: field[starts ? 0 : 1] },
    };
    const segment: CrossingSegment = {
      edgeId: edge.id, from: frame.point(distance, left), to: frame.point(distance, -right),
      roadway: { from: frame.point(distance, half), to: frame.point(distance, -half) }, width: WIDTH,
      markings: [-1, 0, 1].map(offset => frame.rectangle(distance + offset, [-half, half], 0.5)),
    };
    return { approach, segment };
  }
}

class StreetFrame {
  readonly length: number;
  readonly direction: Vec2;
  constructor(private readonly edge: StreetEdge) {
    const [a, b] = edge.path;
    if (edge.path.length !== 2 || !a || !b || ![...a, ...b].every(Number.isFinite)
      || (a[0] === b[0] && a[1] === b[1])) {
      throw invalidParams('grid crossing requires a straight declared-angle source edge', { edgeId: edge.id });
    }
    this.length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    this.direction = [(b[0] - a[0]) / this.length, (b[1] - a[1]) / this.length];
    const [dx, dz] = this.direction.map(Math.abs);
    const ratio = Math.min(dx, dz) / Math.max(dx, dz);
    if (Math.min(Math.abs(ratio), Math.abs(ratio - 1), Math.abs(ratio - Math.tan(Math.PI / 6))) > 1e-10) {
      throw invalidParams('grid crossing requires a straight declared-angle source edge', { edgeId: edge.id });
    }
  }
  point(station: number, lateral: number): Vec2 {
    const [x, z] = this.edge.path[0], [dx, dz] = this.direction;
    return [x + station * dx - lateral * dz, z + station * dz + lateral * dx];
  }
  rectangle(station: number, lateral: [number, number], width = WIDTH): Polygon {
    return [this.point(station - width / 2, lateral[0]), this.point(station + width / 2, lateral[0]),
      this.point(station + width / 2, lateral[1]), this.point(station - width / 2, lateral[1])];
  }
}

/** Published coordinates sit on the millimetre grid; a replan may land a float step off it. */
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key)
    && equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
