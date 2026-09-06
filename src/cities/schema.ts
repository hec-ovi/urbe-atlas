import type { GenerationProgress, ProgressObserver } from '../../schema/progress';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CityBlueprint } from '../../schema/blueprint';
import type { AtlasParams, Seed } from '../../schema/params';

export type CityStatus = 'queued' | 'running' | 'ready' | 'failed';
export type CityErrorCode =
  | 'E_BAD_REQUEST' | 'E_NOT_FOUND' | 'E_NOT_READY' | 'E_STORAGE'
  | 'E_GENERATION' | 'E_INTERRUPTED'
  | 'E_INVALID_PARAMS' | 'E_UNSATISFIABLE' | 'E_INVARIANT';

export interface CityError {
  code: CityErrorCode;
  message: string;
  details?: unknown;
}

export interface CityRecord {
  id: string;
  source: 'generated' | 'imported';
  seed: Seed;
  params: AtlasParams;
  stage: 'blueprint';
  progress?: GenerationProgress;
  status: CityStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  blueprintUrl?: string;
  stats?: CityBlueprint['stats'];
  error?: CityError;
}

export interface CityList { cities: CityRecord[] }
export type { FormList, FormName, WorkspaceForm } from './forms/schema';
export interface CityErrorResponse { error: CityError }
export interface GeneratedCity { json: string; stats: CityBlueprint['stats'] }

/** Resolves after generation and serialization; rejects with a CityError or Error. */
export type CityGenerator = (params: AtlasParams, signal: AbortSignal, onProgress?: ProgressObserver) => Promise<GeneratedCity>;

export interface CityApiOptions {
  /** Relative paths resolve from the server working directory. */
  dataDir?: string;
  /** Prepared Node worker module; defaults to dist/city-worker.mjs from the working directory. */
  workerUrl?: URL;
  /** Adapter for integration tests or an equivalent isolated generator. */
  generator?: CityGenerator;
}

export interface CityApi {
  handle(request: IncomingMessage, response: ServerResponse, next: () => void): void;
  close(): Promise<void>;
}
