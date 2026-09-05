import type { GroundSurface, Polygon } from '../../schema/blueprint';
import type { GroundSource, SourceGroundSurface } from '../../schema/ground';
import type { SourcePartition } from '../geom/partition/SourcePartition';
import type { GroundSurfaceKind } from './surfaces';

export interface GroundCoverInput {
  boundary: Polygon;
  water: Polygon[];
  stationBays: Polygon[];
  masks: Record<GroundSurfaceKind, Polygon[]>;
}

export interface GroundCoverOwner extends Pick<GroundSurface, 'surface' | 'bottom' | 'top'> {
  ownerId: string;
}

interface RetainedGroundCover {
  partition: SourcePartition;
  boundary: Polygon;
  coordinateScale: 1000;
  excludedOwnerIds: string[];
}

/** Runtime handoff; owner geometry remains in the exact partition. */
export interface GroundCoverPlan extends RetainedGroundCover {
  owners: GroundCoverOwner[];
}

export interface SourceGroundCoverOwner extends Pick<SourceGroundSurface, 'sourceId' | 'surface' | 'bottom' | 'top'> {
  ownerId: string;
}

export interface SourceGroundCoverPlan extends RetainedGroundCover {
  format: 'source-claims-v1';
  sources: GroundSource[];
  owners: SourceGroundCoverOwner[];
}

export type { SourceGroundCoverInput, SourceGroundSnapshot } from '../../schema/ground';
