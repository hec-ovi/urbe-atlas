import type { CrossingSegment, GroundSurface, Polygon, StreetEdge, StreetNode, Vec2 } from '../schema/blueprint';
import { CityCrossingGround, type CityCrossingRegion } from './CityCrossingGround';
import { invariantFailure, invalidParams, unsatisfiable } from './errors';
import { sidewalkBand } from './streets/construction/SidewalkSection';
import type { CrossingPlan, CrossingValidationPlan, JunctionApproach } from './streets/crossings/schema';

export interface CityCrossingInput {
  nodes: readonly StreetNode[];
  edges: readonly StreetEdge[];
  ground: readonly GroundSurface[];
  /** Physical footprints within the configured pedestrian headroom, including highway ramps and supports. */
  obstacles?: readonly Polygon[];
}

const WIDTH = 3;
const HALF = WIDTH / 2;
const PAINT_CLEARANCE = 0.05;
// The fixed 2 m corner ends after the 0.3 m gutter and 0.2 m curb reservation.
const CORNER_CLEARANCE = 2.5;

/** Direct crossing placement for grid streets and declared-angle block cuts. */
export class CityCrossings {
  static plan(input: CityCrossingInput): CrossingPlan {
    const edges = new Map(input.edges.map(edge => [edge.id, edge]));
    const frames = new Map(input.edges.map(edge => [edge.id, new StreetFrame(edge)]));
    const ground = new CityCrossingGround(input.ground, input.obstacles ?? []);
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
    const plan: CrossingPlan = { crossings: [], junctions: [] };
    const occupied = new Map<string, [number, number][]>();
    for (const node of [...input.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
      node.connections.forEach((connection, index) => {
        if (connection.level !== 0) return;
        const incident = connection.edgeIds.map(id => {
          const edge = edges.get(id);
          if (!edge || (edge.from !== node.id && edge.to !== node.id)) throw invalidParams('grid crossing has an invalid incident edge', { nodeId: node.id, edgeId: id });
          return edge;
        });
        const motor = incident.filter(edge => edge.width > 0);
        const continuation = motor.length === 2 && motor[0].crossSection?.runId !== undefined
          && motor[0].crossSection.runId === motor[1].crossSection?.runId;
        if (motor.length === 0 || (incident.length < 2) || (incident.length === 2 && continuation)) return;
        const arms = motor.filter(edge => edge.class !== 'highway' && edge.class !== 'alley'
          && edge.sidewalk.left > 0 && edge.sidewalk.right > 0 && edge.elevationProfile.every(knot => knot.level === 0));
        if (!arms.length) return;
        const groupId = `${node.id}:connection:${index}`;
        const junction = { id: `cj${plan.junctions.length}`, groupIds: [groupId], nodeIds: [node.id],
          internalEdgeIds: [], approaches: [] as JunctionApproach[] };
        const crossing = { nodeId: node.id, junctionId: junction.id, segments: [] as CrossingSegment[] };
        for (const edge of arms.sort((a, b) => a.id.localeCompare(b.id))) {
          const frame = frames.get(edge.id)!;
          const left = sidewalkBand(edge, 'left', 'walking'), right = sidewalkBand(edge, 'right', 'walking');
          const lateral = edge.width / 2 + Math.max(left.offset + left.width / 4, right.offset + right.width / 4);
          const offsets = node.edgeIds.filter(id => id !== edge.id).map(id => {
            const other = edges.get(id), direction = frames.get(id)?.direction;
            if (!other || !direction) throw invalidParams('grid crossing node references a missing edge', { nodeId: node.id });
            const sine = Math.abs(direction[0] * frame.direction[1] - direction[1] * frame.direction[0]);
            if (sine < 1e-10) return 0;
            const cosine = Math.abs(direction[0] * frame.direction[0] + direction[1] * frame.direction[1]);
            return (other.width / 2 + CORNER_CLEARANCE + cosine * lateral) / sine;
          });
          const offset = Math.max(0, ...offsets) + HALF;
          const starts = edge.from === node.id;
          const distance = starts ? offset : frame.length - offset;
          const candidate = this.candidate(edge, frame, node.id, groupId, distance);
          const { approach, segment } = candidate;
          const evidence = { nodeId: node.id, edgeId: edge.id, distance };
          if (distance < HALF || distance > frame.length - HALF
            || occupied.get(edge.id)?.some(([a, b]) => a < approach.station[1] && b > approach.station[0])) {
            throw unsatisfiable('grid street cannot hold its complete crossing fields', evidence);
          }
          const whole = [approach.field, ...Object.values(approach.landings), ...Object.values(approach.walkingLandings)];
          if (!ground.covers(approach.field, ['roadway'])) throw unsatisfiable('grid crossing lacks complete roadway', evidence);
          if (!Object.values(approach.landings).every(polygon => ground.covers(polygon, ['roadway', 'gutter', 'curb', 'sidewalk']))) {
            throw unsatisfiable('grid crossing lacks complete curb and gutter connectors', evidence);
          }
          if (!Object.values(approach.walkingLandings).every(polygon => ground.covers(polygon, ['sidewalk']))) {
            throw unsatisfiable('grid crossing lacks complete paved walking land', evidence);
          }
          if (!whole.every(polygon => ground.clear(polygon))) throw unsatisfiable('grid crossing intersects a physical obstacle', evidence);
          // Stations clear the other approach widths; source ownership checks the complete saved fields.
          if (!whole.every(polygon => traffic.avoidsOtherRoads(polygon, edge.id))) throw unsatisfiable('grid crossing enters another grade road', evidence);
          occupied.set(edge.id, [...(occupied.get(edge.id) ?? []), approach.station]);
          junction.approaches.push(approach);
          crossing.segments.push(segment);
        }
        plan.junctions.push(junction);
        plan.crossings.push(crossing);
      });
    }
    return plan;
  }

  static validate(input: CityCrossingInput, plan: CrossingValidationPlan): void {
    let expected: CrossingPlan;
    try { expected = this.plan(input); }
    catch (error) {
      throw invariantFailure('saved grid crossing ground is incomplete', { reason: error instanceof Error ? error.message : String(error) });
    }
    if (!equal(expected, plan)) throw invariantFailure('saved grid crossings differ from their required module approaches');
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

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key)
    && equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
