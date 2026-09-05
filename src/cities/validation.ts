import type { CityBlueprint } from '../../schema/blueprint';
import type { AtlasParams } from '../../schema/params';
import { CityApiError } from './errors';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalid(message: string): never {
  throw new CityApiError('E_BAD_REQUEST', message, 400);
}

export function cityParams(value: unknown): AtlasParams {
  if (!object(value) || !(
    typeof value.seed === 'string' || (typeof value.seed === 'number' && Number.isFinite(value.seed))
  )) invalid('Provide city parameters with a string or finite number seed.');
  return value as unknown as AtlasParams;
}

export function importedBlueprint(value: unknown): CityBlueprint {
  if (!object(value)) invalid('Provide a complete city blueprint object.');
  const { meta, streets, transit, volumetric, stats } = value;
  if (!object(meta) || typeof meta.version !== 'string' || typeof meta.seed !== 'string' ||
      !object(meta.params) || !object(meta.bounds) || !Array.isArray(meta.bounds.min) ||
      !Array.isArray(meta.bounds.max) || !Array.isArray(meta.boundary) ||
      meta.units !== 'meters' || typeof meta.gridAngle !== 'number') {
    invalid('The blueprint must include complete meta data.');
  }
  cityParams(meta.params);
  for (const field of ['districts', 'blocks', 'parcels']) {
    if (!Array.isArray(value[field])) invalid(`The blueprint must include ${field}.`);
  }
  if (!object(streets) || !['nodes', 'edges', 'crossings', 'signals', 'planting', 'highwayStructures']
    .every(field => Array.isArray(streets[field]))) invalid('The blueprint must include complete streets.');
  if (!object(transit) || !['busStops', 'busRoutes', 'trainStations', 'trainLines', 'subwayStations', 'subwayLines']
    .every(field => Array.isArray(transit[field]))) invalid('The blueprint must include complete transit.');
  if (!object(volumetric) || !Array.isArray(volumetric.buildings) || !Array.isArray(volumetric.ground)) {
    invalid('The blueprint must include volumetric buildings and ground.');
  }
  if (!object(stats) || typeof stats.population !== 'number' || !object(stats.parcelCounts) ||
      !Array.isArray(stats.perDistrict)) invalid('The blueprint must include complete stats.');
  return value as unknown as CityBlueprint;
}
