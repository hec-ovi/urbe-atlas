/** Complete parameter validation before submitting a city. */
import type { AtlasParams } from '../../../schema/params';
import { resolveParams } from '../../params/defaults';

/** Every field a parameter file may carry; anything else is dropped on import. */
const FIELDS: Record<keyof AtlasParams, true> = {
  seed: true,
  size: true,
  irregularity: true,
  footprintShape: true,
  streetDesign: true,
  pavingDesign: true,
  districtCount: true,
  maxFloors: true,
  maxFloorsByDistrict: true,
  tierWeights: true,
  features: true,
  hydrology: true,
};

/** Reads a parameter file. Throws Error with a readable reason when it is not one. */
export function parseParams(text: string): AtlasParams {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('not valid JSON');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('not an atlas parameter file');
  }
  const source = raw as Record<string, unknown>;
  if (typeof source.seed !== 'string' && typeof source.seed !== 'number') {
    throw new Error('no seed in the file');
  }
  const params: Record<string, unknown> = {};
  for (const field of Object.keys(FIELDS)) {
    if (source[field] !== undefined) params[field] = source[field];
  }
  return resolveParams(params as unknown as AtlasParams);
}
