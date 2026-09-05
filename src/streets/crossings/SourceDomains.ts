import type { Polygon, StreetEdge } from '../../../schema/blueprint';
import { GRID_STEP } from '../../geom/clip';
import { approachBands } from './ApproachGeometry';
import { CROSSING_DIMENSIONS, CrossingFrame, FootprintIndex } from './Footprints';
import { CrossingIntervals } from './intervals/CrossingIntervals';
import type { CrossingSourceInput } from './schema';
import type { EdgePlanningReservations } from '../construction/corridors/schema';
import { intersectRanges } from './StationRanges';
import { Traffic } from './Traffic';

/** Source walking geometry and connected traffic determine physical domain extent. */
export class SourceDomains {
  private readonly reservations: Map<string, EdgePlanningReservations>;
  private readonly roadway: Map<string, Polygon[]>;
  constructor(input: CrossingSourceInput) {
    this.reservations = new Map(input.reservations.edges.map(edge => [edge.edgeId, edge]));
    this.roadway = new Traffic(input).byEdge;
  }

  conflict(edge: StreetEdge, contactEdgeIds: readonly string[], fields: 1 | 2 = 2): boolean {
    const foreign = new FootprintIndex([...new Set(contactEdgeIds)].filter(id => id !== edge.id)
      .flatMap(id => this.roadway.get(id) ?? []));
    const bands = approachBands(edge), lateral = bands.whole;
    const own = this.reservations.get(edge.id)!;
    let first = Infinity, last = -Infinity, offset = 0;
    for (let i = 1; i < edge.path.length; i++) {
      const frame = new CrossingFrame(edge.path[i - 1], edge.path[i]);
      if (frame.length >= CROSSING_DIMENSIONS.width) {
        const sweep = frame.rectangle(frame.length / 2, lateral, frame.length);
        let intervals = CrossingIntervals.find({ a: edge.path[i - 1], b: edge.path[i],
          width: CROSSING_DIMENSIONS.width, sourceOffset: offset, lateral, allowed: [sweep], forbidden: foreign.near(sweep) });
        const sourceBands: { lateral: [number, number]; allowed: Polygon[]; excluded?: Polygon[] }[] = [
          { lateral: bands.field, allowed: this.roadway.get(edge.id) ?? [], excluded: foreign.near(sweep) },
          { lateral: bands.leftTerminal, allowed: own.sides.left.walking },
          { lateral: bands.rightTerminal, allowed: own.sides.right.walking },
        ];
        for (const sourceBand of sourceBands) {
          if (!intervals.length) break;
          intervals = intersectRanges(intervals, CrossingIntervals.find({
            a: edge.path[i - 1], b: edge.path[i], width: CROSSING_DIMENSIONS.width, sourceOffset: offset, ...sourceBand,
          }));
        }
        for (const interval of intervals) {
          first = Math.min(first, offset + interval.from);
          last = Math.max(last, offset + interval.to);
        }
      }
      offset += frame.length;
    }
    return fields === 1 ? first === Infinity : last - first < CROSSING_DIMENSIONS.width + GRID_STEP;
  }
}
