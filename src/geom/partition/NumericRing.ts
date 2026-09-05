import { PointPool, ringSign, type Ring } from './Exact';
import { readRing } from './RingInput';

/** Checks the published view without moving its vertices. */
export function numericRing(ring: Ring): boolean {
  const pool = new PointPool(), points = ring.map(point => pool.input(point.value));
  if (new Set(points.map(point => point.key)).size !== points.length || ringSign(points) <= 0) return false;
  try { readRing(ring.map(point => point.value), pool); return true; }
  catch (error) { if (error instanceof AtlasError) return false; throw error; }
}
import { AtlasError } from '../../errors';
