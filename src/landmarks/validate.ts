import { invalidParams } from '../errors';
import type { LandmarkFloors } from './schema';

export function validateLandmarkFloors(value: unknown): LandmarkFloors {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw invalidParams('landmarkFloors must map parcel IDs to floor counts', { field: 'landmarkFloors' });
  }
  for (const [parcelId, floors] of Object.entries(value)) {
    if (parcelId.length === 0 || !Number.isSafeInteger(floors) || floors < 1) {
      throw invalidParams('landmarkFloors counts must be positive integers', { field: 'landmarkFloors', parcelId });
    }
  }
  return Object.fromEntries(Object.entries(value)) as LandmarkFloors;
}
