import type { PartitionClaim, PartitionEdgeMask } from '../geom/partition/schema';
import { JunctionSource } from './JunctionSource';

/** Nested parallel boundaries. The bevel closes when its two offset intercepts meet. */
export class JunctionReturns {
  constructor(private readonly source: JunctionSource) {}

  at(offset: number): Omit<PartitionClaim, 'id'> {
    const s = this.source, { uMin, uMax, vMax } = s.cuts;
    const avenue = s.avenueHalf + offset, branch = s.branchHalf + offset;
    const masks = [s.rectangle(uMin, -avenue, uMax, avenue), s.rectangle(-branch, 0, branch, vMax)];
    const edgeMasks: PartitionEdgeMask[] = [];
    const intercept = s.input.setback - (2 - Math.SQRT2) * offset;
    if (intercept > 0) for (const sign of [-1, 1]) {
      const corner = s.point(sign * branch, avenue);
      const along = s.point(sign < 0 ? uMin : uMax, avenue);
      const across = s.point(sign * branch, vMax);
      const length = (end: number[]) => Math.hypot(end[0] - corner[0], end[1] - corner[1]);
      edgeMasks.push([
        { from: corner, to: along, t: 0 },
        { from: corner, to: along, t: intercept / length(along) },
        { from: corner, to: across, t: intercept / length(across) },
      ]);
    }
    return { masks, edgeMasks, encoding: 'authored-1mm' };
  }
}
