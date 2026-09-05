import type { Polygon, StreetEdge } from '../../../schema/blueprint';
import { CROSSING_DIMENSIONS, CrossingFrame, FootprintIndex } from './Footprints';
import { CrossingIntervals } from './intervals/CrossingIntervals';
import type { StationInterval } from './intervals/schema';
import type { CrossingInput } from './schema';
import type { EdgePlanningReservations } from '../construction/corridors/schema';
import { invariantFailure } from '../../errors';
import { approachBands, approachGeometry, type ApproachCandidate } from './ApproachGeometry';
import { intersectRanges } from './StationRanges';
import { Traffic } from './Traffic';
export type { ApproachCandidate } from './ApproachGeometry';

/** Solves an edge once; its endpoint groups choose opposite ends of these intervals. */
export class Approaches {
  private readonly road: FootprintIndex;
  private readonly pavement: FootprintIndex;
  private readonly crossingGround: FootprintIndex;
  private readonly obstacles: FootprintIndex;
  private readonly roadByEdge: Map<string, Polygon[]>;
  private readonly byEdge: Map<string, EdgePlanningReservations>;

  constructor(input: CrossingInput) {
    this.road = new FootprintIndex(input.ground.filter((g) => g.surface === 'roadway').map((g) => g.polygon));
    this.pavement = new FootprintIndex(input.ground.filter((g) => g.surface === 'curb' || g.surface === 'sidewalk').map((g) => g.polygon));
    this.crossingGround = new FootprintIndex(input.ground.filter((g) => ['roadway', 'curb', 'sidewalk'].includes(g.surface)).map((g) => g.polygon));
    this.obstacles = new FootprintIndex(input.obstacles ?? []);
    this.byEdge = new Map(input.reservations.edges.map((e) => [e.edgeId, e]));
    this.roadByEdge = new Traffic(input).byEdge;
  }

  ends(edge: StreetEdge): { first: ApproachCandidate | null; last: ApproachCandidate | null } {
    const otherRoads = new FootprintIndex([...this.roadByEdge].filter(([id]) => id !== edge.id).flatMap(([, polygons]) => polygons));
    const bands = approachBands(edge);
    const own = this.byEdge.get(edge.id)!;
    const ownRoadway = this.roadByEdge.get(edge.id) ?? [];
    const ownRoad = new FootprintIndex(ownRoadway);
    let first: ApproachCandidate | null = null, last: ApproachCandidate | null = null, offset = 0;
    for (let i = 1; i < edge.path.length; i++) {
      const frame = new CrossingFrame(edge.path[i - 1], edge.path[i]);
      if (frame.length < CROSSING_DIMENSIONS.width) { offset += frame.length; continue; }
      const whole = frame.rectangle(frame.length / 2, bands.whole, frame.length);
      const forbidden = [...otherRoads.near(whole), ...this.obstacles.near(whole)];
      const ranges = [
        { lateral: bands.whole, allowed: this.crossingGround.near(whole), forbidden },
        { lateral: bands.field, allowed: this.road.near(whole), excluded: otherRoads.near(whole) },
        { lateral: bands.field, allowed: ownRoadway },
        { lateral: bands.leftTerminal, allowed: own.sides.left.walking },
        { lateral: bands.rightTerminal, allowed: own.sides.right.walking },
        { lateral: bands.leftTerminal, allowed: this.pavement.near(whole) },
        { lateral: bands.rightTerminal, allowed: this.pavement.near(whole) },
      ];
      let intervals: StationInterval[] = [{ from: CROSSING_DIMENSIONS.width / 2, to: frame.length - CROSSING_DIMENSIONS.width / 2 }];
      for (const range of ranges) {
        if (!intervals.length) break;
        intervals = intersectRanges(intervals, CrossingIntervals.find({
          a: edge.path[i - 1], b: edge.path[i], width: CROSSING_DIMENSIONS.width, sourceOffset: offset,
          lateral: range.lateral, allowed: range.allowed, forbidden: range.forbidden, excluded: range.excluded,
        }));
      }
      const at = (local: number): ApproachCandidate => approachGeometry(edge, frame, offset, local);
      const accepts = (station: number): boolean => {
        const candidate = at(station);
        const { field, landings, walkingLandings } = candidate.approach;
        if (otherRoads.overlapsArea(field)) return false;
        if (![field, ...candidate.segment.markings].every((polygon) => this.road.covers(polygon) && ownRoad.covers(polygon))) return false;
        if (!this.crossingGround.covers(landings.left) || !this.crossingGround.covers(landings.right)) return false;
        if (!this.pavement.covers(walkingLandings.left) || !this.pavement.covers(walkingLandings.right)) return false;
        const ownedField = new FootprintIndex([field]);
        if (!candidate.segment.markings.every((polygon) => ownedField.covers(polygon))) return false;
        return [field, landings.left, landings.right, walkingLandings.left, walkingLandings.right, ...candidate.segment.markings]
          .every((polygon) => !this.obstacles.intersects(polygon) && (polygon === field || !otherRoads.intersects(polygon)));
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
