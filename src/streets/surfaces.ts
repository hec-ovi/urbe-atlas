/** Exact vertical construction levels for every ground-cover region, meters. */
export const GROUND_LEVELS = {
  roadway: { bottom: -0.2, top: 0 },
  curb: { bottom: 0, top: 0.15 },
  sidewalk: { bottom: 0, top: 0.15 },
  block: { bottom: 0, top: 0.15 },
  open: { bottom: 0, top: 0.15 },
} as const;

export type GroundSurfaceKind = keyof typeof GROUND_LEVELS;
