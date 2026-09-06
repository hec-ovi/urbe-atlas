import type { GroundSurface, Polygon } from '../schema/blueprint';
import type { ModuleGroundRegion } from './streets/construction/modules/schema';
import { difference, union } from './geom/clip';
import { PolygonIndex } from './geom/PolygonIndex';

export const CITY_GROUND_LEVELS = {
  roadway: { bottom: -0.2, top: 0 }, curb: { bottom: -0.03, top: 0.2 },
  gutter: { bottom: -0.03, top: 0 }, sidewalk: { bottom: 0, top: 0.2 },
  block: { bottom: 0, top: 0.2 }, open: { bottom: 0, top: 0.2 },
} as const;

export class CityGround {
  static build(input: { boundary: Polygon; water: Polygon[]; roadway: Polygon[]; blockBounds: Polygon[];
    modules: ModuleGroundRegion[]; lots: Polygon[]; open: Polygon[]; stationBays: Polygon[] }): GroundSurface[] {
    const ground: GroundSurface[] = input.modules.map(({ blockId, ...region }) => ({ ...region, moduleBlockId: blockId }));
    const append = (surface: GroundSurface['surface'], polygons: Polygon[], top: number, bottom = 0) => {
      ground.push(...polygons.map(polygon => ({ surface, polygon, top, bottom })));
    };
    append('roadway', input.water.length ? difference(input.roadway, input.water) : input.roadway, 0, -0.2);
    const existing = new PolygonIndex([...ground.map(region => region.polygon), ...input.water]);
    const bayPaving = union(input.stationBays).flatMap(bay => difference([bay], existing.near(bay)));
    append('sidewalk', bayPaving, 0.2);
    const bays = new PolygonIndex(bayPaving);
    const outsideBays = (polygons: Polygon[]) => polygons.flatMap(polygon => {
      const cuts = bays.near(polygon);
      return cuts.length ? difference([polygon], cuts) : [polygon];
    });
    append('block', outsideBays(input.lots), 0.2);
    append('open', outsideBays(input.open), 0.2);
    append('open', difference([input.boundary], [...input.water, ...input.roadway, ...input.blockBounds,
      ...input.modules.map(region => region.polygon), ...input.stationBays]), 0.2);
    return ground;
  }
}
