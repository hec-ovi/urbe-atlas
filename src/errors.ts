import type { AtlasErrorCode } from '../schema/blueprint';

export class AtlasError extends Error {
  readonly code: AtlasErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AtlasErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AtlasError';
    this.code = code;
    this.details = details;
  }
}

export function invalidParams(message: string, details?: Record<string, unknown>): AtlasError {
  return new AtlasError('E_INVALID_PARAMS', message, details);
}

export function unsatisfiable(message: string, details?: Record<string, unknown>): AtlasError {
  return new AtlasError('E_UNSATISFIABLE', message, details);
}

export function invariantFailure(message: string, details?: Record<string, unknown>): AtlasError {
  return new AtlasError('E_INVARIANT', message, details);
}
