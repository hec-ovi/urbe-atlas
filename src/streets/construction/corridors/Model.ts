import { GRID_STEP } from '../../../geom/clip';
import type { CorridorSweepModel } from './schema';

export const CORRIDOR_SWEEP_MODEL: Readonly<CorridorSweepModel> = Object.freeze({
  id: 'atlas-directed-corridors',
  version: '1.0.0',
  authority: 'edge-local-planning',
  units: 'metres',
  coordinateGrid: GRID_STEP,
  maximumFanStepRadians: Math.PI / 180,
  bandOrder: Object.freeze(['curb', 'border', 'furnishing', 'walking', 'frontage'] as const),
  radialOrigin: 'centerline',
  joins: 'shared-shortest-angle-fans',
  stations: 'equal-per-turn',
  caps: 'quarter-fans-per-side',
  bandOperation: 'outer-union-minus-inner-union',
  highwayRoadway: 'kernel-round-buffer',
});

export const EXPLICIT_CORRIDOR_SWEEP_MODEL: Readonly<CorridorSweepModel> = Object.freeze({
  ...CORRIDOR_SWEEP_MODEL,
  version: '1.1.0',
  bandOrder: Object.freeze(['gutter-lip', 'gutter', 'curb', 'border', 'furnishing', 'walking', 'frontage'] as const),
});
