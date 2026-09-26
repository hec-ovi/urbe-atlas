import type { HighwayStructure, Polygon } from '../../../../schema/blueprint';
import { invariantFailure } from '../../../errors';
import { bounds } from '../../../geom/polygon';
import { length as pathLength } from '../../../geom/polyline';
import { corridorObstacles } from './SupportStations';
import { clearSupportAt } from './SupportSite';
import { clearSpans, planSupportStations } from './SupportSpans';
import type { HighwayEnvelope } from './schema';
import { HIGHWAY_DECK } from './dimensions';

/** Adds columns to the supplied envelope without altering its construction plan. */
export function supportHighwayEnvelopes(
  envelopes: readonly HighwayEnvelope[],
  gradeObstacles: readonly Polygon[] = [],
): HighwayStructure[] {
  const obstacles = gradeObstacles.map((polygon) => ({ polygon, box: bounds(polygon) }));
  return envelopes.map((envelope) => {
    const nearby = corridorObstacles(envelope, obstacles);
    // The foot bears on grade. Columns begin once their whole footprint clears the slab.
    const flatStart = envelope.ramps.start * envelope.deckThickness / envelope.level + HIGHWAY_DECK.supportSize / 2;
    const flatEnd = pathLength(envelope.path) - envelope.ramps.end * envelope.deckThickness / envelope.level - HIGHWAY_DECK.supportSize / 2;
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
