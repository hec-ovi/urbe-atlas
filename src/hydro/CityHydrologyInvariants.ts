import type { CityBlueprint, Polygon, Vec2 } from '../../schema/blueprint';
import { bufferLine, intersection } from '../geom/clip';
import { area, distanceToOutline, pointInPolygon } from '../geom/polygon';
import { AtlasError } from '../errors';
import { checkHydrology } from './HydrologyInvariants';

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
      const permitted = structure.edgeIds.some((edgeId) => plan.structures.some((permit) => permit.network === 'street'
        && permit.refId === edgeId && permit.kind === 'bridge'));
      if (!permitted) fail(`highway support on ${structure.edgeIds.join(',')} overlaps water without a bridge`);
    }
  }
  for (const ground of blueprint.volumetric.ground) clearPolygons(`${ground.surface} ground`, [ground.polygon], water);

  const permits = new Map(plan.structures.map((structure) => [`${structure.network}:${structure.refId}`, structure]));
  for (const edge of blueprint.streets.edges) {
    const width = edge.width + edge.sidewalk.left + edge.sidewalk.right;
    if (width <= 0 || !overlaps(bufferLine(edge.path, width), water)) continue;
    const permit = permits.get(`street:${edge.id}`);
    if (!permit || permit.kind !== 'bridge' || permit.width !== width) fail(`street ${edge.id} overlaps water without its exact bridge`);
  }
  for (const line of blueprint.transit.trainLines) {
    if (!overlaps(bufferLine(line.path, line.width), water)) continue;
    const permit = permits.get(`train:${line.id}`);
    if (!permit || permit.kind !== 'bridge' || permit.width !== line.width) fail(`train ${line.id} overlaps water without its exact bridge`);
  }
  for (const line of blueprint.transit.subwayLines) {
    if (!overlaps(bufferLine(line.path, line.width), water)) continue;
    const permit = permits.get(`subway:${line.id}`);
    if (!permit || permit.kind !== 'tunnel' || permit.width !== line.width) fail(`subway ${line.id} overlaps water without its exact tunnel`);
  }
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
