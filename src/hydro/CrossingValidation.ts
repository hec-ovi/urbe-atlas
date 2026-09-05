import { AtlasError } from '../errors';
import { isSimpleRing } from '../geom/polygon';
import type { HydroPoint, HydroPolygon, HydrologyCrossingInput } from './types';

export function validateCrossing(crossing: HydrologyCrossingInput): void {
  if (!crossing || typeof crossing !== 'object'
    || !['street', 'train', 'subway'].includes(crossing.network)
    || typeof crossing.refId !== 'string' || !crossing.refId
    || !Array.isArray(crossing.path) || crossing.path.length < 2 || !crossing.path.every(validPoint)
    || crossing.path.some((point, index) => index > 0 && equal(point, crossing.path[index - 1]))
    || !Number.isFinite(crossing.width) || !(crossing.width > 0) || !Number.isFinite(crossing.level)
    || (crossing.corridor !== undefined && !validCorridor(crossing.corridor))) {
    throw new AtlasError('E_INVARIANT', `invalid hydrology crossing input ${crossing?.network}:${crossing?.refId}`);
  }
}

export function validCorridor(value: unknown): value is HydroPolygon[] {
  return Array.isArray(value) && value.length > 0 && value.every((polygon) => Array.isArray(polygon)
    && polygon.length >= 3 && polygon.every(validPoint) && isSimpleRing(polygon)
    && polygon.every((point, index) => !equal(point, polygon[(index + 1) % polygon.length]))
    && polygon.reduce((area, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return area + point[0] * next[1] - next[0] * point[1];
    }, 0) > 0);
}

function validPoint(value: unknown): value is HydroPoint {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

function equal(a: HydroPoint, b: HydroPoint): boolean {
  return a[0] === b[0] && a[1] === b[1];
}
