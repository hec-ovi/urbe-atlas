/** Exact, non-overlapping carriageway regions used by the 3D inspection view. */
import type { CityBlueprint, Polygon } from '../../../schema/blueprint';
import { bufferLine, difference, intersection, union } from '../../geom/clip';

export interface StreetSurfaceRegions {
  street: Polygon[];
  road: Polygon[];
}

/**
 * Clips street-class corridors to Atlas's ground partition. Roads own shared
 * junction area, so the two preview materials never occupy the same face.
 */
export function streetSurfaceRegions(blueprint: CityBlueprint): StreetSurfaceRegions {
  const roadway = blueprint.volumetric.ground
    .filter((surface) => surface.surface === 'roadway')
    .map((surface) => surface.polygon);
  const masks = (kind: 'street' | 'road'): Polygon[] => union(
    blueprint.streets.edges
      .filter((edge) => edge.class === kind && edge.width > 0)
      .flatMap((edge) => bufferLine(edge.path, edge.width)),
  );
  const road = intersection(roadway, masks('road'));
  const street = difference(intersection(roadway, masks('street')), road);
  return { street, road };
}
