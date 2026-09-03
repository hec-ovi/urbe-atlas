import type { HydrologyRequest } from '../types';

const boundary: HydrologyRequest['boundary'] = [[40, 40], [760, 40], [760, 760], [40, 760]];

export const HYDROLOGY_FIXTURES: HydrologyRequest[] = [
  { seed: 'lagoon-fixture', size: { width: 800, depth: 800 }, boundary, config: { type: 'lagoon' } },
  { seed: 'river-fixture', size: { width: 800, depth: 800 }, boundary, config: { type: 'river' } },
  { seed: 'coast-fixture', size: { width: 800, depth: 800 }, boundary, config: { type: 'sea-coast' } },
];
