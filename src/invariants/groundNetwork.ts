import type { CityBlueprint } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { bufferLine, difference, intersection, offset } from '../geom/clip';
import { PolygonIndex } from '../geom/PolygonIndex';
import { CURB_WIDTH } from '../streets/widths';
import { StreetCorridors } from '../streets/construction/StreetCorridors';

/** Network ownership is independent of which graph faces can host a block. */
export function checkGroundNetwork(bp: CityBlueprint): void {
  const water = bp.hydrology?.bodies.flatMap((body) => body.surfaces) ?? [];
  const roadwayPolygons = bp.volumetric.ground.filter((ground) => ground.surface === 'roadway').map((ground) => ground.polygon);
  const roadway = new PolygonIndex(roadwayPolygons);
  const sidewalk = new PolygonIndex(bp.volumetric.ground.filter((ground) => ground.surface === 'sidewalk').map((ground) => ground.polygon));
  const besideRoad = new PolygonIndex(offset(roadwayPolygons, CURB_WIDTH));
  if (bp.streets.construction) {
    const construction = new StreetCorridors(bp.streets.edges);
    const publicGround = new PolygonIndex(bp.volumetric.ground
      .filter((ground) => ground.surface === 'roadway' || ground.surface === 'curb' || ground.surface === 'sidewalk')
      .map((ground) => ground.polygon));
    for (const [edgeId, corridor] of construction.byEdge) {
      const required = difference(intersection(corridor, [bp.meta.boundary]), water);
      const missing = offset(difference(required, publicGround.near(required.flat())), -0.01);
      if (missing.length) throw invariantFailure(`edge ${edgeId} has incomplete per-side corridor ground`, { missing });
    }
  }
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
