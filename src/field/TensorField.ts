/**
 * Composite tensor field (Chen et al. 2008): sum of weighted basis fields
 * with gaussian decay. Mixed morphology (grid patches, radial centers,
 * boundary-following edges) is plain field addition.
 * Tensor stored as (a, b) = R(cos 2t, sin 2t); major eigenvector angle = atan2(b, a) / 2.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import { closestOnSegment, distSq, fromAngle, sub, angleOf } from '../geom/vec';

export interface GridBasis {
  kind: 'grid';
  center: Vec2;
  /** Street direction angle in radians. */
  theta: number;
  weight: number;
  /** Gaussian decay radius, meters. */
  sigma: number;
}

export interface RadialBasis {
  kind: 'radial';
  center: Vec2;
  weight: number;
  sigma: number;
}

export type FieldBasis = GridBasis | RadialBasis;

interface Tensor {
  a: number;
  b: number;
}

const DEGENERATE = 1e-4;

export class TensorField {
  private readonly bases: FieldBasis[];
  private readonly boundarySegments: { a: Vec2; b: Vec2; theta: number }[];
  private readonly boundaryWeight: number;
  private readonly boundarySigma: number;

  constructor(options: {
    bases: FieldBasis[];
    boundary: Polygon;
    boundaryWeight: number;
    boundarySigma: number;
  }) {
    this.bases = options.bases;
    this.boundaryWeight = options.boundaryWeight;
    this.boundarySigma = options.boundarySigma;
    this.boundarySegments = [];
    const poly = options.boundary;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      this.boundarySegments.push({ a, b, theta: angleOf(sub(b, a)) });
    }
  }

  private tensor(p: Vec2): Tensor {
    let a = 0;
    let b = 0;
    for (const basis of this.bases) {
      const d2 = distSq(p, basis.center);
      const w = basis.weight * Math.exp(-d2 / (2 * basis.sigma * basis.sigma));
      if (w < 1e-6) continue;
      const theta = basis.kind === 'grid' ? basis.theta : angleOf(sub(p, basis.center));
      a += w * Math.cos(2 * theta);
      b += w * Math.sin(2 * theta);
    }
    if (this.boundaryWeight > 0) {
      let bestD2 = Infinity;
      let bestTheta = 0;
      for (const seg of this.boundarySegments) {
        const { point } = closestOnSegment(p, seg.a, seg.b);
        const d2 = distSq(p, point);
        if (d2 < bestD2) {
          bestD2 = d2;
          bestTheta = seg.theta;
        }
      }
      const w = this.boundaryWeight * Math.exp(-bestD2 / (2 * this.boundarySigma * this.boundarySigma));
      if (w >= 1e-6) {
        a += w * Math.cos(2 * bestTheta);
        b += w * Math.sin(2 * bestTheta);
      }
    }
    return { a, b };
  }

  isDegenerate(p: Vec2): boolean {
    const t = this.tensor(p);
    return Math.hypot(t.a, t.b) < DEGENERATE;
  }

  /** Unit major eigenvector (street direction of the dominant family). */
  major(p: Vec2): Vec2 {
    const t = this.tensor(p);
    if (Math.hypot(t.a, t.b) < DEGENERATE) return [0, 0];
    return fromAngle(Math.atan2(t.b, t.a) / 2);
  }

  /** Unit minor eigenvector, perpendicular to major. */
  minor(p: Vec2): Vec2 {
    const m = this.major(p);
    return [-m[1], m[0]];
  }
}
