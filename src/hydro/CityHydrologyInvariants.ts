import type { CityBlueprint, Polygon, Vec2 } from '../../schema/blueprint';
import { bufferLine, intersection } from '../geom/clip';
import { area, distanceToOutline, pointInPolygon } from '../geom/polygon';
import { AtlasError } from '../errors';
import { checkHydrology } from './HydrologyInvariants';
import { withHydrologyStructures } from './Hydrology';
import type { HydrologyCrossingInput, WaterStructure } from './types';
import { StreetCorridors } from '../streets/construction/StreetCorridors';

const OVERLAP_AREA = 0.01;
const POINT_TOLERANCE = 0.001;

/** Verifies that every city/water contact was excluded or explicitly typed. */
export function checkCityHydrology(blueprint: CityBlueprint): void {
  const plan = blueprint.hydrology;
  if (!plan) return;
  checkHydrology(plan, blueprint.meta.params.size);
  const water = plan.bodies.flatMap((body) => body.surfaces);

  for (const parcel of blueprint.parcels) {
    clearPolygons(`parcel ${parcel.id} lot`, [parcel.lot], water);
    clearPolygons(`parcel ${parcel.id} footprint`, [parcel.footprint], water);
    clearPoint(`parcel ${parcel.id} access`, parcel.access.point, water);
  }
  for (const station of [...blueprint.transit.trainStations, ...blueprint.transit.subwayStations]) {
    clearPolygons(`station ${station.id} platform`, [station.platform], water);
    for (const entrance of station.entrances) clearPoint(`station ${station.id} entrance`, entrance, water);
    for (const shaft of station.shafts) clearPolygons(`station ${station.id} shaft`, [shaft.footprint], water);
  }
  for (const structure of blueprint.streets.highwayStructures) {
    for (const support of structure.supports) {
      if (!overlaps([support.footprint], water)) continue;
      const permitted = plan.structures.filter((permit) => permit.network === 'street'
        && structure.edgeIds.includes(permit.refId) && permit.kind === 'bridge')
        .flatMap((permit) => permit.corridor ?? bufferLine(permit.path, permit.width));
      const contact = intersection([support.footprint], water);
      const wetArea = contact.reduce((sum, polygon) => sum + area(polygon), 0);
      const coveredArea = intersection(contact, permitted).reduce((sum, polygon) => sum + area(polygon), 0);
      if (wetArea - coveredArea > OVERLAP_AREA) fail(`highway support on ${structure.edgeIds.join(',')} overlaps water without its exact bridge reservation`);
    }
  }
  for (const ground of blueprint.volumetric.ground) clearPolygons(`${ground.surface} ground`, [ground.polygon], water);

  const corridors = blueprint.streets.construction ? new StreetCorridors(blueprint.streets.edges).byEdge : undefined;
  const crossings: HydrologyCrossingInput[] = [
    ...blueprint.streets.edges.map((edge): HydrologyCrossingInput => ({
      network: 'street', refId: edge.id, path: edge.path,
      width: edge.width + edge.sidewalk.left + edge.sidewalk.right, level: edge.level,
      ...(corridors ? { corridor: corridors.get(edge.id) } : {}),
    })),
    ...blueprint.transit.trainLines.map((line): HydrologyCrossingInput => ({
      network: 'train', refId: line.id, path: line.path, width: line.width, level: line.level,
    })),
    ...blueprint.transit.subwayLines.map((line): HydrologyCrossingInput => ({
      network: 'subway', refId: line.id, path: line.path, width: line.width, level: line.level,
    })),
  ].filter((crossing) => crossing.width > 0);
  const expected = withHydrologyStructures(plan, crossings)!.structures.map(signature).sort();
  const actual = plan.structures.map(signature).sort();
  if (expected.length !== actual.length || expected.some((entry, index) => entry !== actual[index])) {
    fail('network water contacts differ from their exact bridge or tunnel reservations');
  }
}

function signature(structure: WaterStructure): string {
  return JSON.stringify([
    structure.network, structure.refId, structure.waterBodyId, structure.kind,
    structure.path, structure.width, structure.level, structure.corridor ?? null,
  ]);
}

function clearPolygons(label: string, subject: Polygon[], water: Polygon[]): void {
  if (overlaps(subject, water)) fail(`${label} overlaps water`);
}

function clearPoint(label: string, point: Vec2, water: Polygon[]): void {
  if (water.some((surface) => pointInPolygon(point, surface) || distanceToOutline(point, surface) < POINT_TOLERANCE)) fail(`${label} overlaps water`);
}

function overlaps(subject: Polygon[], water: Polygon[]): boolean {
  return intersection(subject, water).reduce((total, polygon) => total + area(polygon), 0) > OVERLAP_AREA;
}

function fail(message: string): never {
  throw new AtlasError('E_INVARIANT', message);
}
