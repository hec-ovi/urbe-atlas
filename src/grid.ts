/**
 * One angle for the city's street directions and district cuts.
 */
import type { Rng } from './core/rng';

export const cityGridAngle = (rng: Rng, irregularity: number): number =>
  irregularity === 0 ? 0 : rng.range(0, Math.PI);
