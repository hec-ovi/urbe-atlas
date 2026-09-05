import type { StreetEdge } from '../../../schema/blueprint';
import { invalidParams } from '../../errors';
import { approachBands } from './ApproachGeometry';
import { CROSSING_DIMENSIONS, CrossingFrame } from './Footprints';
import type { CrossingConstruction, JunctionApproach } from './schema';

/** Uses the published source segment and station, never projected output polygons. */
export function crossingConstruction(edge: StreetEdge, approach: Pick<JunctionApproach, 'distance'>): CrossingConstruction {
  if (!Number.isFinite(approach.distance) || !(edge.width > 0)) {
    throw invalidParams('crossing construction needs a finite station and positive road width');
  }
  let offset = 0;
  for (let index = 1; index < edge.path.length; index++) {
    const frame = new CrossingFrame(edge.path[index - 1], edge.path[index]);
    const station = approach.distance - offset;
    const halfWidth = CROSSING_DIMENSIONS.width / 2;
    if (station >= halfWidth && station <= frame.length - halfWidth) {
      const bands = approachBands(edge);
      return {
        field: frame.construction(station, bands.field),
        landings: { left: frame.construction(station, [bands.half, bands.left]),
          right: frame.construction(station, [-bands.right, -bands.half]) },
        walkingLandings: { left: frame.construction(station, bands.leftTerminal),
          right: frame.construction(station, bands.rightTerminal) },
      };
    }
    offset += frame.length;
  }
  throw invalidParams('crossing construction field crosses a source bend or endpoint', { edgeId: edge.id, distance: approach.distance });
}
