import type { Vec2, StreetEdge, Polygon } from '../../schema/blueprint';
import type { JunctionGroundInput } from '../../schema/junction-ground';
import type { SidewalkGeometry } from './construction/schema/sections';
import { invariantFailure } from '../errors';

const ordered = (values: string[]) => [...values].sort();
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const require = (condition: unknown, field: string, details: object = {}): void => {
  if (!condition) throw invariantFailure('junction ground source is unsupported or inconsistent', { field, ...details });
};
export const authored = (value: number): number => Math.round(value * 1000) / 1000;

/** Validated source frame and station cuts for one orthogonal through-avenue T. */
export class JunctionSource {
  readonly edges: StreetEdge[];
  readonly origin: Vec2;
  readonly u: Vec2;
  readonly v: Vec2;
  readonly geometry: SidewalkGeometry;
  readonly avenueHalf: number;
  readonly branchHalf: number;
  readonly cuts: { uMin: number; uMax: number; vMin: number; vMax: number };
  readonly boundary: Polygon;
  readonly handoffs = new Map<string, { runId: string; runStation: number; distance: number }>();

  constructor(readonly input: JunctionGroundInput) {
    require(Number.isFinite(input.bottom) && Number.isFinite(input.roadwayTop) && input.bottom <= input.roadwayTop
      && Number.isFinite(input.setback) && input.setback > 0 && Number.isFinite(input.stationPitch) && input.stationPitch > 0, 'levels/settings');
    require(input.datum.groundFormat === 'side-bands-v1' && Array.isArray(input.datum.grade.sideBands)
      && input.datum.grade.pedestrian.length === 0, 'datum format');
    const contact = input.contact;
    require(contact.groups.length === 1 && contact.groups[0].junction && contact.internalEdgeIds.length === 0
      && contact.arms.length === 3 && input.edges.length === 3, 'contact topology');
    this.edges = [...input.edges].sort((a, b) => a.id.localeCompare(b.id));
    const ids = this.edges.map(edge => edge.id);
    require(new Set(ids).size === 3 && equal(ordered(contact.arms.map(arm => arm.edgeId)), ids)
      && equal(ordered(contact.groups[0].pedestrianEdgeIds), ids) && equal(ordered(contact.groups[0].trafficEdgeIds), ids), 'contact membership');
    const directions = new Map<string, Vec2>();
    const positions: Vec2[] = [];
    for (const edge of this.edges) {
      const arm = contact.arms.find(row => row.edgeId === edge.id)!;
      require(arm.groupId === contact.groups[0].id && arm.nodeId === contact.groups[0].nodeId
        && edge[arm.end] === arm.nodeId && edge.path.length === 2, 'arm source', { edgeId: edge.id });
      const start = edge.path[arm.end === 'from' ? 0 : 1], end = edge.path[arm.end === 'from' ? 1 : 0];
      const dx = end[0] - start[0], dz = end[1] - start[1];
      const length = Math.hypot(dx, dz);
      require(length > 0 && (dx === 0 || dz === 0) && edge.path.flat().every(value => Number.isFinite(value) && value === authored(value)), 'straight authored axes', { edgeId: edge.id });
      require(edge.elevationProfile.length >= 2 && edge.elevationProfile[0].distance === 0
        && edge.elevationProfile.at(-1)!.distance === length && edge.elevationProfile.every(point => point.level === input.roadwayTop), 'flat grade', { edgeId: edge.id });
      directions.set(edge.id, [Math.sign(dx), Math.sign(dz)]);
      positions.push(start);
    }
    require(positions.every(point => equal(point, positions[0])), 'common source endpoint');
    this.origin = [...positions[0]];
    const avenues = this.edges.filter(edge => edge.class === 'road');
    const branch = this.edges.find(edge => edge.class === 'street');
    require(avenues.length === 2 && branch && avenues.every(edge => edge.crossSection?.lanes.length === 4)
      && branch.crossSection?.lanes.length === 2, 'through-avenue T');
    this.u = directions.get(avenues[0].id)!;
    this.v = directions.get(branch!.id)!;
    const opposite = directions.get(avenues[1].id)!;
    require(this.u[0] === -opposite[0] && this.u[1] === -opposite[1] && this.u[0] * this.v[0] + this.u[1] * this.v[1] === 0
      && avenues[0].crossSection!.runId === avenues[1].crossSection!.runId && avenues[0].width === avenues[1].width, 'through-run');
    this.avenueHalf = avenues[0].width / 2;
    this.branchHalf = branch!.width / 2;
    const geometry = this.edges[0].crossSection?.sidewalks.left.geometry;
    require(geometry?.version === '1.0.0', 'explicit geometry');
    this.geometry = structuredClone(geometry!);
    const expectedRows = this.edges.length * 2 * this.geometry.intervals.length;
    require(input.datum.grade.sideBands!.length === expectedRows, 'complete role rows');
    for (const edge of this.edges) {
      const spans = this.spans(edge.id);
      require(spans.length > 0 && spans.every(span => span.elevation === 'at-grade'), 'source spans', { edgeId: edge.id });
      for (const side of ['left', 'right'] as const) {
        require(equal(edge.crossSection?.sidewalks[side].geometry, this.geometry), 'matching side profiles', { edgeId: edge.id, side });
        for (const interval of this.geometry.intervals) {
          const rows = input.datum.grade.sideBands!.filter(row => row.edgeId === edge.id && row.side === side && row.role === interval.role);
          require(rows.length === 1 && equal(rows[0].spanIds, spans.map(span => span.id))
            && rows[0].top === input.roadwayTop + interval.top, 'role provenance/height', { edgeId: edge.id, side, role: interval.role });
        }
      }
    }
    require(input.datum.spans.length === this.edges.reduce((sum, edge) => sum + this.spans(edge.id).length, 0)
      && equal(ordered(input.datum.grade.roadway.map(row => row.spanId)), ordered(input.datum.spans.map(span => span.id))), 'complete roadway spans');
    const minimum = Math.max(this.avenueHalf, this.branchHalf) + this.geometry.totalWidth + input.setback;
    const cut = (edge: StreetEdge): number => {
      const arm = contact.arms.find(row => row.edgeId === edge.id)!;
      const run = input.runs.find(row => row.id === edge.crossSection!.runId);
      const record = run?.edges.find(row => row.edgeId === edge.id);
      require(record, 'run station', { edgeId: edge.id });
      const length = Math.hypot(edge.path[1][0] - edge.path[0][0], edge.path[1][1] - edge.path[0][1]);
      const roundoff = 2 * Number.EPSILON * Math.max(Math.abs(record!.start), Math.abs(record!.end), length);
      require(Math.abs(record!.end - record!.start - length) <= roundoff, 'run length', { edgeId: edge.id });
      const forward = (arm.end === 'from') === record!.forward;
      const station = forward ? record!.start : record!.end;
      const target = station + (forward ? minimum : -minimum);
      const snapped = (forward ? Math.ceil(target / input.stationPitch) : Math.floor(target / input.stationPitch)) * input.stationPitch;
      const distance = Math.abs(snapped - station);
      require(distance + this.geometry.totalWidth < length, 'available full-width arm', { edgeId: edge.id, required: distance + this.geometry.totalWidth, length });
      this.handoffs.set(edge.id, { runId: run!.id, runStation: snapped, distance: arm.end === 'from' ? distance : length - distance });
      return distance;
    };
    this.cuts = { uMin: -cut(avenues[1]), uMax: cut(avenues[0]), vMin: -Math.ceil(minimum / input.stationPitch) * input.stationPitch, vMax: cut(branch!) };
    const { uMin, uMax, vMin, vMax } = this.cuts;
    this.boundary = this.rectangle(uMin, vMin, uMax, vMax);
  }

  spans(edgeId: string) {
    return this.input.datum.spans.filter(span => span.edgeId === edgeId).sort((a, b) => a.start.distance - b.start.distance);
  }

  point(u: number, v: number): Vec2 {
    return [authored(this.origin[0] + this.u[0] * u + this.v[0] * v), authored(this.origin[1] + this.u[1] * u + this.v[1] * v)];
  }

  rectangle(u0: number, v0: number, u1: number, v1: number): Polygon {
    return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => this.point(u, v));
  }
}
