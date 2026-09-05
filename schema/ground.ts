import type { GroundSurface, Polygon } from './blueprint';
import type { CorridorBandRole } from '../src/streets/construction/corridors/schema';

export type SourceGroundSurfaceKind = GroundSurface['surface'] | 'gutter' | 'gutter-lip';

interface GroundSourceLevels {
  /** Caller-owned identity, stable across geometry subdivision and input ordering. */
  id: string;
  /** Absolute construction levels in metres. */
  bottom: number;
  top: number;
}

/** Geometry-free provenance for a source-owned construction surface. */
export type GroundSource = GroundSourceLevels & (
  | { kind: 'roadway'; edgeId: string; spanIds: string[]; surface: 'roadway' }
  | {
    kind: 'side-band'; edgeId: string; spanIds: string[]; side: 'left' | 'right';
    role: CorridorBandRole; surface: 'gutter-lip' | 'gutter' | 'curb' | 'sidewalk';
  }
  | { kind: 'land'; landId: string; surface: 'sidewalk' | 'block' | 'open' }
);

export interface GroundSourceClaim {
  source: GroundSource;
  /** Complete authored masks; overlaps within this one source are allowed. */
  masks: Polygon[];
}

export interface SourceGroundCoverInput {
  format: 'source-claims-v1';
  boundary: Polygon;
  excluded: Polygon[];
  /** These complete claims must fit available land and have disjoint interiors. */
  claims: GroundSourceClaim[];
  remainder: GroundSource & { kind: 'land'; surface: 'open' };
}

/** Additive source-owned shape; legacy city ground keeps its existing schema. */
export interface SourceGroundSurface extends Omit<GroundSurface, 'surface'> {
  sourceId: string;
  surface: SourceGroundSurfaceKind;
}

export interface SourceGroundSnapshot {
  format: 'source-claims-v1';
  sources: GroundSource[];
  /** Sole rendered/collidable owner polygons. */
  ground: SourceGroundSurface[];
}
