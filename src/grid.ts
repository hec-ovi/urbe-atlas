/**
 * The city grid: one angle for the whole city, so blocks stay square and
 * monotonous from district to district and district boundaries can follow the
 * same lines the streets do.
 */
import type { Rng } from './core/rng';

export const cityGridAngle = (rng: Rng): number => rng.range(0, Math.PI);
