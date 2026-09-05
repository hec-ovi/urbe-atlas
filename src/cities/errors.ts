import type { CityError, CityErrorCode } from './schema';

export class CityApiError extends Error {
  constructor(readonly code: CityErrorCode, message: string, readonly status: number) {
    super(message);
  }
}

export function generationError(error: unknown): CityError {
  if (error !== null && typeof error === 'object' && 'code' in error && 'message' in error) {
    const { code, message } = error;
    if (typeof message === 'string' &&
        ['E_INVALID_PARAMS', 'E_UNSATISFIABLE', 'E_INVARIANT', 'E_INTERRUPTED', 'E_GENERATION'].includes(String(code))) {
      return {
        code: code as CityErrorCode,
        message,
        ...('details' in error ? { details: error.details } : {}),
      };
    }
  }
  return { code: 'E_GENERATION', message: error instanceof Error ? error.message : 'City generation failed.' };
}

export function interruptedError(): CityError {
  return { code: 'E_INTERRUPTED', message: 'City generation was interrupted. Submit its parameters to try again.' };
}
