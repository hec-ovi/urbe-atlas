/**
 * Where each network runs in height, meters along +Y from the ground plane.
 * A highway is an elevated deck over the city, a subway
 * bores under the streets. Stations sit at their line's level; entrances stay
 * on the sidewalk at grade.
 */
export const LEVELS = {
  ground: 0,
  highway: 8,
  subway: -12,
} as const;
