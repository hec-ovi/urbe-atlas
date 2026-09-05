import type { Vec2 } from '../../../../schema/blueprint';
import { snapPoint } from '../../../geom/clip';
import { edgePositionView } from '../../../geom/partition/EdgeMasks';

export class StationFrame {
  readonly length: number;
  readonly u: Vec2;
  readonly v: Vec2;
  private readonly edges = new Map<number, { a: Vec2; b: Vec2 }>();

  constructor(readonly a: Vec2, private readonly b: Vec2) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    this.length = Math.hypot(dx, dz);
    this.u = [dx / this.length, dz / this.length];
    this.v = [-this.u[1], this.u[0]];
  }

  point(station: number, lateral: number): Vec2 {
    return snapPoint([this.a[0] + this.u[0] * station + this.v[0] * lateral,
      this.a[1] + this.u[1] * station + this.v[1] * lateral]);
  }

  /** Subdivides one canonical source-long edge without snapping derived points. */
  edgePoint(station: number, lateral: number): Vec2 {
    let edge = this.edges.get(lateral);
    if (!edge) {
      edge = {
        a: snapPoint([this.a[0] + this.v[0] * lateral, this.a[1] + this.v[1] * lateral]),
        b: snapPoint([this.b[0] + this.v[0] * lateral, this.b[1] + this.v[1] * lateral]),
      };
      this.edges.set(lateral, edge);
    }
    if (station === 0) return [...edge.a];
    if (station === this.length) return [...edge.b];
    return edgePositionView({ encoding: 'authored-1mm',
      position: { from: edge.a, to: edge.b, t: station / this.length } });
  }

  project(point: Vec2): number {
    return (point[0] - this.a[0]) * this.u[0] + (point[1] - this.a[1]) * this.u[1];
  }
}
