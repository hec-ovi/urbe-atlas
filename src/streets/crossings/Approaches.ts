import type { StreetEdge } from '../../../schema/blueprint';
import { CROSSING_DIMENSIONS, CrossingFrame, FootprintIndex } from './Footprints';
import { CrossingIntervals } from './intervals/CrossingIntervals';
import { FootprintRegions } from './intervals/FootprintRegions';
import type { StationInterval } from './intervals/schema';
import { invariantFailure } from '../../errors';
import { approachBands, approachGeometry, type ApproachCandidate } from './ApproachGeometry';
import { intersectRanges } from './StationRanges';
import { CrossingFields } from './CrossingFields';
export type { ApproachCandidate } from './ApproachGeometry';

/** Solves an edge once; its endpoint groups choose opposite ends of these intervals. */
export class Approaches {
  constructor(private readonly fields: CrossingFields) {}

  ends(edge: StreetEdge): { first: ApproachCandidate | null; last: ApproachCandidate | null } {
    const { roadway, pavement, crossingGround } = this.fields;
    const bands = approachBands(edge);
    const segments = edge.path.slice(1).map((b, index) => {
      const frame = new CrossingFrame(edge.path[index], b);
      return { frame, whole: frame.length >= CROSSING_DIMENSIONS.width
        ? frame.rectangle(frame.length / 2, bands.whole, frame.length) : null };
    });
    const near = (index: FootprintIndex) => [...new Set(segments.flatMap(({ whole }) => whole ? index.near(whole) : []))];
    const foreign = near(this.fields.foreignRoads(edge.id)), physical = near(this.fields.obstacles);
    const otherRoads = new FootprintRegions(foreign), obstacles = new FootprintRegions(physical);
    const forbidden = new FootprintRegions([...foreign, ...physical]);
    const ownRoad = this.fields.ownRoad(edge.id);
    let first: ApproachCandidate | null = null, last: ApproachCandidate | null = null, offset = 0;
    for (let i = 0; i < segments.length; i++) {
      const { frame, whole } = segments[i];
      if (!whole) { offset += frame.length; continue; }
      const ranges = [
        { lateral: bands.whole, allowed: crossingGround.regions, forbidden },
        { lateral: bands.field, allowed: roadway.regions, excluded: otherRoads },
        { lateral: bands.field, allowed: ownRoad.regions },
        { lateral: bands.leftTerminal, allowed: this.fields.walking(edge.id, 'left').regions },
        { lateral: bands.rightTerminal, allowed: this.fields.walking(edge.id, 'right').regions },
        { lateral: bands.leftTerminal, allowed: pavement.regions },
        { lateral: bands.rightTerminal, allowed: pavement.regions },
      ];
      let intervals: StationInterval[] = [{ from: CROSSING_DIMENSIONS.width / 2, to: frame.length - CROSSING_DIMENSIONS.width / 2 }];
      for (const range of ranges) {
        if (!intervals.length) break;
        intervals = intersectRanges(intervals, CrossingIntervals.find({
          a: edge.path[i], b: edge.path[i + 1], width: CROSSING_DIMENSIONS.width, sourceOffset: offset,
          lateral: range.lateral, allowed: range.allowed, forbidden: range.forbidden, excluded: range.excluded,
        }));
      }
      const at = (local: number): ApproachCandidate => approachGeometry(edge, frame, offset, local);
      const accepts = (station: number): boolean => {
        const candidate = at(station);
        const { field, landings, walkingLandings } = candidate.approach;
        if (otherRoads.overlapsArea(field)) return false;
        if (![field, ...candidate.segment.markings].every((polygon) => roadway.covers(polygon) && ownRoad.covers(polygon))) return false;
        if (!crossingGround.covers(landings.left) || !crossingGround.covers(landings.right)) return false;
        if (!pavement.covers(walkingLandings.left) || !pavement.covers(walkingLandings.right)) return false;
        const ownedField = new FootprintIndex([field]);
        if (!candidate.segment.markings.every((polygon) => ownedField.covers(polygon))) return false;
        return [field, landings.left, landings.right, walkingLandings.left, walkingLandings.right, ...candidate.segment.markings]
          .every((polygon) => !obstacles.intersects(polygon) && (polygon === field || !otherRoads.intersects(polygon)));
      };
      for (const interval of intervals) {
        if (!first) {
          if (!accepts(interval.from)) throw invariantFailure('crossing interval fails its shared source boundary', { edgeId: edge.id, distance: offset + interval.from });
          first = at(interval.from);
        }
        if (!accepts(interval.to)) throw invariantFailure('crossing interval fails its shared source boundary', { edgeId: edge.id, distance: offset + interval.to });
        last = at(interval.to);
      }
      offset += frame.length;
    }
    return { first, last };
  }
}
