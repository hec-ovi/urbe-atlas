import type { CityBlueprint } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { bufferLine, difference, intersection, offset } from '../geom/clip';
import { PolygonIndex } from '../geom/PolygonIndex';
import { CURB_WIDTH } from '../streets/widths';

/** Network ownership is independent of which graph faces can host a block. */
export function checkGroundNetwork(bp: CityBlueprint): void {
  const water = bp.hydrology?.bodies.flatMap((body) => body.surfaces) ?? [];
  const roadway = new PolygonIndex(bp.volumetric.ground.filter((ground) => ground.surface === 'roadway').map((ground) => ground.polygon));
  const sidewalk = new PolygonIndex(bp.volumetric.ground.filter((ground) => ground.surface === 'sidewalk').map((ground) => ground.polygon));
  const roadEdges = bp.streets.edges.filter((edge) => edge.width > 0);
  const besideRoad = new PolygonIndex(roadEdges.flatMap((edge) => bufferLine(edge.path, edge.width + CURB_WIDTH * 2)));
  for (const edge of bp.streets.edges) {
    if (edge.width === 0 && edge.class !== 'alley') continue;
    const corridor = bufferLine(edge.path, edge.width || CURB_WIDTH * 2);
    const land = difference(intersection(corridor, [bp.meta.boundary]), water);
    const required = edge.class === 'alley' ? difference(land, besideRoad.near(land.flat())) : land;
    const covering = (edge.class === 'alley' ? sidewalk : roadway).near(required.flat());
    const missing = offset(difference(required, covering), -0.01);
    if (missing.length === 0) continue;
    throw invariantFailure(`edge ${edge.id} has incomplete ${edge.class === 'alley' ? 'pedestrian seam' : 'carriageway'} ground`, { missing });
  }
}
