import type { StreetEdge } from './blueprint';
import type { GroundSource } from './ground';
import type { GradeDatumPlan } from '../src/streets/construction/datum/schema';
import type { StreetRun } from '../src/streets/construction/schema/sections';
import type { SourceContactDomain } from '../src/streets/crossings/schema';

/** One source contact and its three complete straight grade arms. */
export interface JunctionGroundInput {
  edges: StreetEdge[];
  runs: StreetRun[];
  contact: SourceContactDomain;
  datum: GradeDatumPlan;
  /** Absolute common construction bottom and roadway top, metres. */
  bottom: number;
  roadwayTop: number;
  /** Bevel intercept along each original carriageway boundary, metres. */
  setback: number;
  /** Shared source-run station pitch, metres. */
  stationPitch: number;
  remainder: GroundSource & { kind: 'land'; surface: 'open' };
}
