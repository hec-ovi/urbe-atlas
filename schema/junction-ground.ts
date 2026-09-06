import type { StreetEdge, Vec2 } from './blueprint';
import type { GroundSource } from './ground';
import type { GradeDatumPlan } from '../src/streets/construction/datum/schema';
import type { StreetRun } from '../src/streets/construction/schema/sections';
import type { SourceContactDomain } from '../src/streets/crossings/schema';
import type { PartitionEdgeMask } from '../src/geom/partition/schema';

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

/** Original-arm fitting intents, never replacement ground polygons. */
export interface JunctionFittingConstruction {
  contactId: string;
  encoding: 'authored-1mm';
  fields: {
    id: string;
    sourceIds: string[];
    edgeId: string;
    side: 'left' | 'right';
    runId: string;
    /** Centreline origin at run station zero. V follows the left normal of U. */
    frame: { origin: Vec2; u: Vec2 };
    handoff: { runStation: number; distance: number };
    mask: PartitionEdgeMask;
    transitionIds: string[];
  }[];
  /** Infinite authored supporting lines; extend strips past owner bounds before fitting cells. */
  transitions: {
    id: string;
    fieldIds: [string, string];
    from: Vec2;
    to: Vec2;
  }[];
}
