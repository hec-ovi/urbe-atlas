import type { Vec2 } from '../../../../schema/blueprint';
import type { CandidateMouth, CandidateRectangle, ReceivingFace } from './schema';

export class Face {
  readonly axis: 0 | 1;
  readonly fixed: number;
  readonly low: number;
  readonly high: number;

  constructor(readonly reference: ReceivingFace, rectangle: CandidateRectangle) {
    this.axis = reference.side === 'south' || reference.side === 'north' ? 0 : 1;
    this.low = rectangle.min[this.axis];
    this.high = rectangle.max[this.axis];
    this.fixed = reference.side === 'north' || reference.side === 'east'
      ? rectangle.max[1 - this.axis] : rectangle.min[1 - this.axis];
  }

  interval(normal: Vec2, width: number, clearance: number): [number, number] {
    const base = normal[1 - this.axis] * this.fixed;
    const a = base + normal[this.axis] * (this.low + clearance);
    const b = base + normal[this.axis] * (this.high - clearance);
    if (this.high - this.low < 2 * clearance) return [Infinity, -Infinity];
    return [Math.min(a, b) + width / 2, Math.max(a, b) - width / 2];
  }

  point(normal: Vec2, offset: number): Vec2 {
    const station = (offset - normal[1 - this.axis] * this.fixed) / normal[this.axis];
    return this.axis === 0 ? [station, this.fixed] : [this.fixed, station];
  }

  mouth(normal: Vec2, offset: number, width: number): CandidateMouth {
    const points: [Vec2, Vec2] = [this.point(normal, offset - width / 2), this.point(normal, offset + width / 2)];
    points.sort((a, b) => a[this.axis] - b[this.axis]);
    return { ...this.reference, points, cornerClearances: [points[0][this.axis] - this.low, this.high - points[1][this.axis]] };
  }
}
