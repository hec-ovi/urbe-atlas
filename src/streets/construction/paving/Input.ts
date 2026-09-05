import { invalidParams, invariantFailure } from '../../../errors';
import { validateStreetSections } from '../validateSections';
import { area } from './Geometry';
import type { GroundSurface, Polygon } from '../../../../schema/blueprint';
import type { PavingInput, SharedPavingInput } from './producer-schema';
import type { PavingDesign } from './schema';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export function validateInput(input: PavingInput, design: PavingDesign): void {
  validateContext(input, design);
  validateOwners(input, input.ground);
  for (const ground of input.ground) {
    if (ground.construction !== undefined) throw invariantFailure('paving input already carries fitted construction');
    validatePolygon(ground.polygon);
  }
}

export function validateSharedInput(input: SharedPavingInput, design: PavingDesign): void {
  validateContext(input, design);
  const source = input.groundSource;
  if (!source || source.coordinateScale !== 1000 || !source.partition || !Array.isArray(source.owners)
    || !Array.isArray(source.excludedOwnerIds)) throw invariantFailure('paving shared source is malformed');
  validatePolygon(source.boundary);
  for (const polygon of [source.boundary, ...input.districts.map(district => district.boundary),
    ...(input.stationBays ?? []).map(bay => bay.footprint)]) {
    if (polygon.some(point => point.some(value => Math.round(value * 1000) / 1000 !== value))) {
      throw invariantFailure('shared paving planning polygons must be authored on the 1 mm lattice');
    }
  }
  validateOwners(input, source.owners);
  const ids = [...source.owners.map(owner => owner.ownerId), ...source.excludedOwnerIds];
  if (ids.some(value => !id(value)) || new Set(ids).size !== ids.length) {
    throw invariantFailure('paving shared owners need unique nonempty ids');
  }
  // Public read-only operations prove every handle exists without rebuilding geometry.
  for (const ownerId of ids) source.partition.boundaries(ownerId);
}

function validateContext(input: Omit<PavingInput, 'ground'>, design: PavingDesign): void {
  const districts = new Set(input.districts.map(district => district.id));
  if (districts.size !== input.districts.length || input.districts.some(district => !id(district.id))) {
    throw invariantFailure('paving districts need unique nonempty ids');
  }
  if (design.districtLayouts.some(override => !districts.has(override.districtId))) {
    throw invalidParams('paving override references an unknown published district');
  }
  if (!input.streets.construction) throw invariantFailure('paving requires published street construction');
  validateStreetSections({ streets: input.streets });
  const bayIds = new Set<string>();
  for (const bay of input.stationBays ?? []) {
    const key = `${bay.stationId}:${bay.entranceIndex}`;
    if (!id(bay.stationId) || !Number.isInteger(bay.entranceIndex) || bay.entranceIndex < 0 || bayIds.has(key)) {
      throw invariantFailure('paving station bays need unique station and entrance references');
    }
    bayIds.add(key);
  }
  for (const polygon of [...input.districts.map(district => district.boundary),
    ...(input.stationBays ?? []).map(bay => bay.footprint)]) {
    validatePolygon(polygon);
  }
}

function validateOwners(input: Omit<PavingInput, 'ground'>, owners: Pick<GroundSurface, 'surface' | 'bottom' | 'top'>[]): void {
  if (!input.streets.nodes.length && owners.some(ground => ground.surface === 'sidewalk' || ground.surface === 'curb')) {
    throw invariantFailure('paving source ground needs a street owner');
  }
  for (const ground of owners) {
    if (!['roadway', 'curb', 'sidewalk', 'block', 'open'].includes(ground.surface)
      || !finite(ground.bottom) || !finite(ground.top) || ground.bottom > ground.top) {
      throw invariantFailure('paving source surface and levels are invalid');
    }
  }
}

function validatePolygon(polygon: Polygon): void {
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.some(point => !Array.isArray(point)
    || point.length !== 2 || point.some(value => !finite(value)))) {
    throw invariantFailure('paving source polygon is malformed');
  }
  if (!(area(polygon) > 0)) throw invariantFailure('paving source polygon needs positive CCW area');
}
