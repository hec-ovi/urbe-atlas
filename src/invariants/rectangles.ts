/**
 * The plan is rectangles: every ring a consumer reads as land or ground is four
 * axis-aligned corners. A city with hydrology is the one exception, where water
 * cuts land along a shoreline, so the check runs on dry cities.
 */
import type { CityBlueprint, Polygon } from '../../schema/blueprint';
import { invariantFailure } from '../errors';

/** Coordinates are published on a millimetre grid, so corners compare there. */
const grid = (value: number): number => Math.round(value * 1000);

export function isRectangle(ring: Polygon): boolean {
  if (!Array.isArray(ring) || ring.length !== 4) return false;
  const xs = new Set(ring.map(point => grid(point[0])));
  const zs = new Set(ring.map(point => grid(point[1])));
  return xs.size === 2 && zs.size === 2;
}

export function checkRectangles(bp: CityBlueprint): void {
  if (bp.hydrology) return;
  const check = (where: string, rings: Polygon[]): void => {
    const bad = rings.findIndex(ring => !isRectangle(ring));
    if (bad >= 0) throw invariantFailure(`${where} is not an axis-aligned rectangle`, { index: bad, ring: rings[bad] });
  };
  check('a district boundary', bp.districts.map(district => district.boundary));
  check('a block boundary', bp.blocks.map(block => block.boundary));
  check('a block kerb strip', bp.blocks.flatMap(block => block.curb));
  check('a block sidewalk strip', bp.blocks.flatMap(block => block.sidewalk));
  check('a block open area', bp.blocks.flatMap(block => block.openAreas));
  check('a parcel lot', bp.parcels.map(parcel => parcel.lot));
  check('a parcel footprint', bp.parcels.map(parcel => parcel.footprint));
  check('a ground region', bp.volumetric.ground.map(region => region.polygon));
  check('a building volume', bp.volumetric.buildings.map(building => building.footprint));
  check('the city boundary', [bp.meta.boundary]);
}
