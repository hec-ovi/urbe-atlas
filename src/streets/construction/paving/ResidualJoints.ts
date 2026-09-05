import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import type { PartitionClaim } from '../../../geom/partition/schema';
import { bounds, local } from './Geometry';
import type { PavingFrame, PavingModule } from './schema';

/** Transverse joints inside an already owned, possibly nonrectangular strip. */
export class ResidualJoints {
  static claims(boundaries: Polygon[], frame: PavingFrame, module: PavingModule, nextId: () => string): PartitionClaim[] {
    if (!boundaries.length || module.joint[0] === 0) return [];
    const extent = bounds(boundaries.map(ring => ring.map(point => local(frame, point))));
    const pitch = module.pitch[0];
    const halfJoint = module.joint[0] / 2;
    const low = extent.min[1] - module.pitch[1], high = extent.max[1] + module.pitch[1];
    const point = (u: number, v: number): Vec2 => [
      (frame.origin[0] + frame.u[0] * u) - frame.u[1] * v,
      (frame.origin[1] + frame.u[1] * u) + frame.u[0] * v,
    ];
    const claims: PartitionClaim[] = [];
    const first = Math.ceil((extent.min[0] - halfJoint) / pitch);
    const last = Math.floor((extent.max[0] + halfJoint) / pitch);
    for (let station = first; station <= last; station++) {
      const start = station * pitch - halfJoint, end = station * pitch + halfJoint;
      claims.push({ id: nextId(), encoding: 'binary', masks: [[
        point(start, low), point(end, low), point(end, high), point(start, high),
      ]] });
    }
    return claims;
  }
}
