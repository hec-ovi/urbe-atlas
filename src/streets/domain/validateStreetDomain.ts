import { difference, hasInteriorBeyondPrecision } from '../../geom/clip';
import { invariantFailure } from '../../errors';
import { StreetCorridors } from '../construction/StreetCorridors';
import type { StreetDomainState } from './schema';

/** A published width reserves complete city land, including its outer side. */
export function validateStreetDomain(city: StreetDomainState): void {
  const corridors = new StreetCorridors(city.streets.edges);
  for (const [edgeId, polygons] of corridors.byEdge) {
    const outside = difference(polygons, [city.meta.boundary]);
    if (hasInteriorBeyondPrecision(outside)) {
      throw invariantFailure(`street ${edgeId} publishes a corridor outside city land`, { edgeId, outside });
    }
  }
}
