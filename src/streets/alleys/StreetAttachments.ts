import type { Polyline, Vec2 } from '../../../schema/blueprint';
import { snapPoint } from '../../geom/clip';
import { add, cross, scale, sub } from '../../geom/vec';
import type { AlleyNetwork } from './schema';

/** Terminal search uses real street centerlines, not a fixed extension length. */
export class StreetAttachments {
  private readonly segments: [Vec2, Vec2][];

  constructor(private readonly network: AlleyNetwork) {
    this.segments = network.edges.filter((edge) => edge.class === 'street' || edge.class === 'road')
      .flatMap((edge) => edge.path.slice(1).map((point, i): [Vec2, Vec2] => [edge.path[i], point]));
  }

  join(origin: Vec2, direction: Vec2, back: number, forward: number): Polyline | null {
    let start = -Infinity, end = Infinity;
    for (const [a, b] of this.segments) {
      const edge = sub(b, a), relative = sub(a, origin);
      const denominator = cross(direction, edge);
      if (denominator === 0) continue;
      const alongEdge = cross(relative, direction) / denominator;
      if (alongEdge < 0 || alongEdge > 1) continue;
      const alongCut = cross(relative, edge) / denominator;
      if (alongCut <= back) start = Math.max(start, alongCut);
      if (alongCut >= forward) end = Math.min(end, alongCut);
    }
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    const path: Polyline = [snapPoint(add(origin, scale(direction, start))), snapPoint(add(origin, scale(direction, end)))];
    return this.network.domain.covers(path) ? path : null;
  }
}
