import type { Vec2 } from '../../schema/blueprint';
import type { JunctionFittingConstruction } from '../../schema/junction-ground';
import { invariantFailure } from '../errors';
import { JunctionSource } from './JunctionSource';

/** Integer construction sectors share corner seams and original run phases. */
export class JunctionFitting {
  constructor(private readonly source: JunctionSource) {}

  build(): JunctionFittingConstruction {
    const s = this.source;
    const origin = s.origin.map(value => Math.round(value * 1000)) as Vec2;
    const local = (point: Vec2): Vec2 => {
      const x = Math.round(point[0] * 1000) - origin[0], z = Math.round(point[1] * 1000) - origin[1];
      return [x * s.u[0] + z * s.u[1], x * s.v[0] + z * s.v[1]];
    };
    const world = ([u, v]: Vec2): Vec2 => [
      (origin[0] + s.u[0] * u + s.v[0] * v) / 1000,
      (origin[1] + s.u[1] * u + s.v[1] * v) / 1000,
    ];
    const boundary = s.boundary.map(local);
    const uMin = Math.min(...boundary.map(p => p[0])), uMax = Math.max(...boundary.map(p => p[0]));
    const vMin = Math.min(...boundary.map(p => p[1])), vMax = Math.max(...boundary.map(p => p[1]));
    const result: JunctionFittingConstruction = { contactId: s.input.contact.id, encoding: 'authored-1mm', fields: [], transitions: [] };
    const sourceIds = s.geometry.intervals.filter(row => row.end > row.start)
      .map(row => `junction:${result.contactId}:${row.role}`);
    const frames = new Map<string, { origin: Vec2; u: Vec2 }>();
    for (const edge of s.edges) {
      const runId = edge.crossSection!.runId;
      const record = s.input.runs.find(run => run.id === runId)!.edges.find(row => row.edgeId === edge.id)!;
      const from = edge.path[record.forward ? 0 : 1], to = edge.path[record.forward ? 1 : 0];
      const u: Vec2 = [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1])];
      const existing = frames.get(runId);
      if (existing && (existing.u[0] !== u[0] || existing.u[1] !== u[1])) {
        throw invariantFailure('junction fitting changes original run direction', { runId, edgeId: edge.id });
      }
      if (!existing) frames.set(runId, { origin: [from[0] - u[0] * record.start, from[1] - u[1] * record.start], u });
    }
    const add = (edgeId: string, normal: Vec2, polygon: Vec2[], transitionIds: string[]) => {
      if (polygon.length < 3) return undefined;
      const edge = s.edges.find(edge => edge.id === edgeId)!;
      const dx = edge.path[1][0] - edge.path[0][0], dz = edge.path[1][1] - edge.path[0][1];
      const side = dx * normal[1] - dz * normal[0] > 0 ? 'left' : 'right';
      const runId = edge.crossSection!.runId, handoff = s.handoffs.get(edgeId)!;
      const id = `jf:${result.contactId}:${edgeId}:${side}`;
      result.fields.push({ id, sourceIds: [...sourceIds], edgeId, side, runId,
        frame: structuredClone(frames.get(runId)!), handoff: { runStation: handoff.runStation, distance: handoff.distance },
        mask: polygon.map(point => { const at = world(point); return { from: at, to: [...at] as Vec2, t: 0 }; }), transitionIds });
      return id;
    };
    const branch = s.edges.find(edge => edge.class === 'street')!;
    for (const sign of [-1, 1]) {
      const avenue = s.edges.find(edge => {
        if (edge.class !== 'road') return false;
        const arm = s.input.contact.arms.find(arm => arm.edgeId === edge.id)!;
        return Math.sign(local(edge.path[arm.end === 'from' ? 1 : 0])[0]) === sign;
      })!;
      const lo = sign < 0 ? uMin : 0, hi = sign < 0 ? 0 : uMax;
      const rectangle: Vec2[] = [[lo, 0], [hi, 0], [hi, vMax], [lo, vMax]];
      const corner = local(s.point(sign * s.branchHalf, s.avenueHalf));
      const intercept = corner[1] - sign * corner[0];
      const seamId = `jt:${result.contactId}:${avenue.id}:${branch.id}`;
      const avenueField = add(avenue.id, s.v, this.cut(rectangle, sign, intercept, true), [seamId]);
      const branchField = add(branch.id, [sign * s.u[0], sign * s.u[1]], this.cut(rectangle, sign, intercept, false), [seamId]);
      add(avenue.id, [-s.v[0], -s.v[1]], [[lo, vMin], [hi, vMin], [hi, 0], [lo, 0]], []);
      if (!avenueField || !branchField) throw invariantFailure('junction fitting lacks a complete corner field', { contactId: result.contactId });
      const start = Math.max(0, -intercept), end = Math.min(sign < 0 ? -lo : hi, vMax - intercept);
      result.transitions.push({ id: seamId, fieldIds: [avenueField, branchField],
        from: world([sign * start, intercept + start]), to: world([sign * end, intercept + end]) });
    }
    result.fields.sort((a, b) => a.id.localeCompare(b.id));
    result.transitions.sort((a, b) => a.id.localeCompare(b.id));
    return result;
  }

  private cut(rectangle: Vec2[], sign: number, intercept: number, below: boolean): Vec2[] {
    const result: Vec2[] = [];
    const inside = ([x, y]: Vec2) => below ? y <= intercept + sign * x : y >= intercept + sign * x;
    for (let i = 0; i < rectangle.length; i++) {
      const a = rectangle[i], b = rectangle[(i + 1) % rectangle.length];
      if (inside(a)) result.push(a);
      if (inside(a) !== inside(b)) result.push(a[0] === b[0]
        ? [a[0], intercept + sign * a[0]] : [sign * (a[1] - intercept), a[1]]);
    }
    return result.filter((point, index) => {
      const previous = result[(index + result.length - 1) % result.length];
      return point[0] !== previous[0] || point[1] !== previous[1];
    });
  }
}
