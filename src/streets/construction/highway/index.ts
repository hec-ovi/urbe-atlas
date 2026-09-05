import type { HighwayStructure, Polygon } from '../../../../schema/blueprint';
import { highwayEnvelopes } from './Envelopes';
import { supportHighwayEnvelopes } from './Supports';
import type { HighwayConstructionEdge } from './schema';

export { HIGHWAY_DECK } from './dimensions';
export { applyHighwayElevationProfiles } from './Elevations';
export { highwayEnvelopes } from './Envelopes';
export { highwayElevationProfile, levelAt } from './Profiles';
export { highwayRuns } from './Runs';
export { supportHighwayEnvelopes } from './Supports';
export type { ClassedEdge, HighwayConstructionEdge, HighwayEnvelope, HighwayRun } from './schema';

/** Complete construction for callers that do not need the two planning stages. */
export function highwayStructures(
  edges: readonly HighwayConstructionEdge[],
  gradeObstacles: readonly Polygon[] = [],
): HighwayStructure[] {
  return supportHighwayEnvelopes(highwayEnvelopes(edges), gradeObstacles);
}
