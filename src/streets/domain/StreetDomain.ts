import type { Polygon, Polyline, Vec2 } from '../../../schema/blueprint';
import { GRID_STEP, offset } from '../../geom/clip';
import { coversPath, coversSegment } from '../../geom/polygon';
import { unsatisfiable } from '../../errors';
import { roadwayTotal, sidewalkTotal } from '../construction/Design';
import { ALLEY_WIDTH, HIGHWAY_WIDTH } from '../widths';
import type { StreetDomainInput, StreetDomainPlan } from './schema';

export class StreetDomain implements StreetDomainPlan {
  private constructor(readonly boundary: Polygon, readonly clearance: number) {}

  static reserve(input: StreetDomainInput): StreetDomain {
    const sidewalk = Math.max(...input.design.sidewalkProfiles.map(sidewalkTotal));
    const radius = Math.max(
      ...input.design.profiles.map((profile) => roadwayTotal(profile) / 2 + sidewalk),
      input.highways ? HIGHWAY_WIDTH / 2 : 0,
      input.alleys ? ALLEY_WIDTH[1] / 2 : 0,
    );
    const clearance = radius + GRID_STEP * 2;
    const pieces = offset([input.boundary], -clearance);
    if (pieces.length !== 1) {
      throw unsatisfiable('street widths leave no connected centerline domain', { clearance, regions: pieces.length });
    }
    return new StreetDomain(pieces[0], clearance);
  }

  contains(point: Vec2): boolean { return coversSegment(this.boundary, point, point); }
  coversSegment(a: Vec2, b: Vec2): boolean { return coversSegment(this.boundary, a, b); }
  covers(path: Polyline): boolean { return coversPath(this.boundary, path); }
}
