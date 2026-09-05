import type { CityBlueprint } from '../../../schema/blueprint';
import { isWorldManifest, type WorldManifest } from './worldManifest';

export interface ExteriorJob {
  id: string;
  blueprintHash: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  out: string;
  total: number;
  completed: number;
  completedParcels: string[];
  manifest: WorldManifest | null;
  error: { code: string; message: string } | null;
}

/** Reject stale, malformed and incomplete jobs before exposing any viewer link. */
export function readExteriorJob(value: unknown, blueprint: CityBlueprint, hash: string, previous?: ExteriorJob): ExteriorJob {
  const invalid = (): never => { throw new Error('Exterior service returned an invalid or mismatched job'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const job = value as ExteriorJob;
  const keys = ['id', 'blueprintHash', 'state', 'out', 'total', 'completed', 'completedParcels', 'manifest', 'error'];
  if (Object.keys(job).some((key) => !keys.includes(key))
    || typeof job.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(job.id)
    || job.blueprintHash !== hash || !/^[a-f0-9]{64}$/.test(hash)
    || !['queued', 'running', 'succeeded', 'failed'].includes(job.state)
    || typeof job.out !== 'string' || !/^\/out\/atlas-exteriors-[A-Za-z0-9_-]+$/.test(job.out)
    || job.total !== blueprint.parcels.length || !Number.isInteger(job.completed) || job.completed < 0
    || !Array.isArray(job.completedParcels) || job.completed !== job.completedParcels.length
    || new Set(job.completedParcels).size !== job.completed
    || (previous && (job.id !== previous.id || job.out !== previous.out || job.completed < previous.completed))) invalid();
  const parcels = new Set(blueprint.parcels.map((parcel) => parcel.id));
  if (!job.completedParcels.every((id) => typeof id === 'string' && parcels.has(id))) invalid();
  if (job.error !== null && (!job.error || typeof job.error.message !== 'string'
    || !['E_INVALID_REQUEST', 'E_UNAVAILABLE', 'E_JOB_NOT_FOUND', 'E_STORAGE', 'E_BUILD_FAILED', 'E_BUILD_INCOMPLETE', 'E_BUSY'].includes(job.error.code))) invalid();
  if (job.manifest !== null && !isWorldManifest(job.manifest)) invalid();
  if (job.state === 'succeeded') {
    const manifest = job.manifest;
    if (!manifest || job.error !== null || job.completed !== parcels.size
      || manifest.seed !== blueprint.meta.seed || manifest.atlasVersion !== blueprint.meta.version
      || manifest.parcels.length !== parcels.size || !manifest.parcels.every((id) => parcels.has(id))
      || manifest.interiors.length !== 0) invalid();
  }
  if (job.state === 'failed' && !job.error) invalid();
  return job;
}
