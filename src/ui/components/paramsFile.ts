/** Parameter files: the full AtlasParams set as JSON, in and out of the browser. */
import type { AtlasParams } from '../../../schema/params';

/** Every field a parameter file may carry; anything else is dropped on import. */
const FIELDS = [
  'seed',
  'size',
  'irregularity',
  'districtCount',
  'maxFloors',
  'maxFloorsByDistrict',
  'tierWeights',
  'features',
] as const;

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
  for (const field of FIELDS) {
    if (source[field] !== undefined) params[field] = source[field];
  }
  return params as unknown as AtlasParams;
}

/** File name a parameter set is saved under. */
export function paramsFileName(seed: AtlasParams['seed']): string {
  return `atlas-params-${String(seed).replace(/[^a-z0-9_-]+/gi, '-')}.json`;
}

/** Hands the parameter set to the browser as a download. */
export function downloadParams(params: AtlasParams, filename: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(params, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
