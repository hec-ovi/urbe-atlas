/** Driving lanes across one carriageway. */
import type { DrivingLane, TravelDirection } from '../../schema/architecture';
import type { StreetEdge } from '../../schema/blueprint';
import { parallel, round } from './Centerline';
import { HIGHWAY_LANES } from './Dimensions';

interface LaneSpec {
  offset: number;
  width: number;
  direction: TravelDirection;
}

export class Lanes {
  /**
   * Lanes left to right across the path direction. A grade street publishes the
   * lanes of its own cross section; a highway splits its deck evenly, the left
   * half running back towards `from` and the right half on towards `to`; an
   * alley carries none.
   */
  static of(edge: StreetEdge): DrivingLane[] {
    return Lanes.specs(edge)
      .sort((a, b) => b.offset - a.offset)
      .map((spec, index) => {
        const path = parallel(edge.path, spec.offset);
        return {
          id: `${edge.id}.v${index}`,
          index,
          offset: round(spec.offset),
          width: spec.width,
          direction: spec.direction,
          path: spec.direction === 'forward' ? path : [...path].reverse(),
        };
      });
  }

  private static specs(edge: StreetEdge): LaneSpec[] {
    if (edge.crossSection) return edge.crossSection.lanes.map(({ offset, width, direction }) => ({ offset, width, direction }));
    if (edge.class !== 'highway' || edge.width <= 0) return [];
    const width = edge.width / HIGHWAY_LANES;
    return Array.from({ length: HIGHWAY_LANES }, (_, index) => ({
      offset: edge.width / 2 - width * (index + 0.5),
      width,
      direction: index < HIGHWAY_LANES / 2 ? 'backward' as const : 'forward' as const,
    }));
  }
}
