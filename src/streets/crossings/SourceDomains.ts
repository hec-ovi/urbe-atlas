import type { StreetEdge } from '../../../schema/blueprint';
import { GRID_STEP } from '../../geom/clip';
import { approachBands } from './ApproachGeometry';
import { CROSSING_DIMENSIONS, CrossingFrame } from './Footprints';
import { CrossingIntervals } from './intervals/CrossingIntervals';
import type { CrossingSourceInput } from './schema';
import { intersectRanges } from './StationRanges';
import type { FootprintRegions } from './intervals/FootprintRegions';
import { CrossingFields } from './CrossingFields';

/** Source walking geometry and connected traffic determine physical domain extent. */
export class SourceDomains {
  private readonly fields: CrossingFields;
  constructor(input: CrossingSourceInput) { this.fields = new CrossingFields(input); }

  conflict(edge: StreetEdge, contactEdgeIds: readonly string[], fields: 1 | 2 = 2): boolean {
    const foreign = this.fields.foreignRoads(edge.id, contactEdgeIds);
    const source = this.fields.source(edge.id);
    const bands = approachBands(edge), lateral = bands.whole;
    let first = Infinity, last = -Infinity, offset = 0;
    for (let i = 1; i < edge.path.length; i++) {
      const frame = new CrossingFrame(edge.path[i - 1], edge.path[i]);
      if (frame.length >= CROSSING_DIMENSIONS.width) {
        const sweep = frame.rectangle(frame.length / 2, lateral, frame.length);
        let intervals = CrossingIntervals.find({ a: edge.path[i - 1], b: edge.path[i],
          width: CROSSING_DIMENSIONS.width, sourceOffset: offset, lateral, allowed: [sweep], forbidden: foreign.regions });
        const sourceBands: { lateral: [number, number]; role: 'roadway' | 'left' | 'right'; excluded?: FootprintRegions }[] = [
          { lateral: bands.field, role: 'roadway', excluded: foreign.regions },
          { lateral: bands.leftTerminal, role: 'left' },
          { lateral: bands.rightTerminal, role: 'right' },
        ];
        for (const sourceBand of sourceBands) {
          if (!intervals.length) break;
          intervals = intersectRanges(intervals, CrossingIntervals.find({
            a: edge.path[i - 1], b: edge.path[i], width: CROSSING_DIMENSIONS.width, sourceOffset: offset,
            lateral: sourceBand.lateral, excluded: sourceBand.excluded,
            allowed: source[sourceBand.role].regions,
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
