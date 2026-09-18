import type { HighwayStructure, Polygon } from '../../../../schema/blueprint';
import { invariantFailure } from '../../../errors';
import { bounds } from '../../../geom/polygon';
import { length as pathLength } from '../../../geom/polyline';
import { corridorObstacles } from './SupportStations';
import { clearSupportAt } from './SupportSite';
import { clearSpans, planSupportStations } from './SupportSpans';
import type { HighwayEnvelope } from './schema';

/** Adds columns to the supplied envelope without altering its construction plan. */
export function supportHighwayEnvelopes(
  envelopes: readonly HighwayEnvelope[],
  gradeObstacles: readonly Polygon[] = [],
): HighwayStructure[] {
  const obstacles = gradeObstacles.map((polygon) => ({ polygon, box: bounds(polygon) }));
  return envelopes.map((envelope) => {
    const nearby = corridorObstacles(envelope, obstacles);
    const flatStart = envelope.ramps.start;
    const flatEnd = pathLength(envelope.path) - envelope.ramps.end;
    const stations = planSupportStations(clearSpans(envelope, nearby, flatStart, flatEnd), flatStart, flatEnd);
    if (!stations) {
      throw invariantFailure(`highway ${envelope.edgeIds[0]} cannot place a support clear of grade infrastructure`);
    }
    const supports = stations.map((along) => clearSupportAt(envelope, along, nearby));
    if (supports.some((support) => support === null)) {
      throw invariantFailure(`highway ${envelope.edgeIds[0]} cannot place a support clear of grade infrastructure`);
    }
    return { ...envelope, supports: supports as HighwayStructure['supports'] };
  });
}
