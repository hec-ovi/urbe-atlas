/** Walking lanes beside one corridor. */
import type { Reservation, WalkingLane } from '../../schema/architecture';
import type { StreetEdge } from '../../schema/blueprint';
import { parallel, round } from './Centerline';
import { FRONTAGE_MARGIN, KERB_MARGIN, MAX_WALKING_LANES, MIN_WALKING_WIDTH, WALKING_LANE_PITCH } from './Dimensions';

export class Walkways {
  /** Land held for the corridor: its carriageway and each side's full reserved width. */
  static reservation(edge: StreetEdge): Reservation {
    return { carriageway: edge.width, left: edge.sidewalk.left, right: edge.sidewalk.right };
  }

  /**
   * Walking lanes on both sides, numbered outward from the carriageway. A side
   * wide enough for more than one lane splits its clear width evenly, so a
   * broad downtown pavement carries parallel streams instead of one wide line.
   * A side too narrow for one lane carries none, as on a highway.
   */
  static of(edge: Pick<StreetEdge, 'id' | 'path'> & { reservation: Reservation }): WalkingLane[] {
    const kerb = edge.reservation.carriageway > 0 ? KERB_MARGIN : 0;
    const inner = edge.reservation.carriageway / 2 + kerb;
    return (['left', 'right'] as const).flatMap(side => {
      const clear = edge.reservation[side] - kerb - FRONTAGE_MARGIN;
      if (clear < MIN_WALKING_WIDTH) return [];
      const count = Math.min(MAX_WALKING_LANES, Math.max(1, Math.floor(clear / WALKING_LANE_PITCH)));
      const width = round(clear / count);
      const sign = side === 'left' ? 1 : -1;
      const initial = side === 'left' ? 'l' : 'r';
      return Array.from({ length: count }, (_, index) => {
        const offset = round(sign * (inner + width * (index + 0.5)));
        return { id: `${edge.id}.w${initial}${index}`, side, index, offset, width, path: parallel(edge.path, offset) };
      });
    });
  }
}
