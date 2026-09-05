import type { GroundSurface } from '../../schema/blueprint';
import type { SourceGroundCoverInput, SourceGroundSnapshot, SourceGroundSurface } from '../../schema/ground';
import { invariantFailure } from '../errors';
import { SourcePartition } from '../geom/partition/SourcePartition';
import { verifyPartition } from '../geom/partition/verifyPartition';
import { GROUND_LEVELS, type GroundSurfaceKind } from './surfaces';
import { GroundClaims } from './GroundClaims';
import { GroundSources } from './GroundSources';
import type { GroundCoverInput, GroundCoverPlan, SourceGroundCoverPlan } from './GroundCoverSchema';
export type { GroundCoverInput, GroundCoverOwner, GroundCoverPlan, SourceGroundCoverPlan } from './GroundCoverSchema';

/** One source partition owns every final land vertex and surface. */
export class GroundCover {
  static build(input: GroundCoverInput): GroundSurface[];
  static build(input: SourceGroundCoverInput): SourceGroundSnapshot;
  static build(input: GroundCoverInput | SourceGroundCoverInput): GroundSurface[] | SourceGroundSnapshot {
    return this.snapshot(this.plan(input));
  }

  static plan(input: GroundCoverInput): GroundCoverPlan;
  static plan(input: SourceGroundCoverInput): SourceGroundCoverPlan;
  static plan(input: GroundCoverInput | SourceGroundCoverInput): GroundCoverPlan | SourceGroundCoverPlan;
  static plan(input: GroundCoverInput | SourceGroundCoverInput): GroundCoverPlan | SourceGroundCoverPlan {
    if ('format' in input) return GroundClaims.plan(input);
    const partition = SourcePartition.create({ id: 'city', source: input.boundary, coordinateScale: 1000 });
    const kinds = ['roadway', 'curb', 'sidewalk', 'block', 'open'] as const;
    partition.divide('city', {
      claims: [
        { id: 'water', masks: input.water },
        { id: 'station', masks: input.stationBays },
        ...kinds.map(id => ({ id, masks: input.masks[id] })),
      ],
      remainderId: 'fringe',
    });
    const semantic: [string, GroundSurfaceKind][] = [['station', 'sidewalk'], ...kinds.map(kind => [kind, kind] as [string, GroundSurfaceKind]), ['fringe', 'open']];
    return {
      partition, boundary: input.boundary, coordinateScale: 1000, excludedOwnerIds: ['water'],
      owners: semantic.map(([ownerId, surface]) => ({ ownerId, surface, ...GROUND_LEVELS[surface] })),
    };
  }

  static snapshot(source: GroundCoverPlan): GroundSurface[];
  static snapshot(source: SourceGroundCoverPlan): SourceGroundSnapshot;
  static snapshot(source: GroundCoverPlan | SourceGroundCoverPlan): GroundSurface[] | SourceGroundSnapshot;
  static snapshot(source: GroundCoverPlan | SourceGroundCoverPlan): GroundSurface[] | SourceGroundSnapshot {
    const result = source.partition.finish();
    verifyPartition({ source: source.boundary, partition: result, coordinateScale: source.coordinateScale });
    const excluded = new Set(source.excludedOwnerIds);
    if ('format' in source) {
      if (source.format !== 'source-claims-v1') throw invariantFailure('ground claim format is unsupported');
      const owners = new Map(source.owners.map(owner => [owner.ownerId, owner]));
      const sources = GroundSources.table(source.sources);
      const byId = new Map(sources.map(row => [row.id, row]));
      if (owners.size !== source.owners.length) throw invariantFailure('ground owner ID is repeated');
      for (const owner of source.owners) {
        const metadata = byId.get(owner.sourceId);
        if (!metadata || excluded.has(owner.ownerId) || owner.surface !== metadata.surface
          || owner.bottom !== metadata.bottom || owner.top !== metadata.top) {
          throw invariantFailure('ground owner disagrees with its source metadata', {
            ownerId: owner.ownerId, sourceId: owner.sourceId,
          });
        }
      }
      const ground: SourceGroundSurface[] = result.pieces.filter(piece => !excluded.has(piece.ownerId)).map(piece => {
        const owner = owners.get(piece.ownerId);
        if (!owner) throw invariantFailure(`ground snapshot has no metadata for owner ${piece.ownerId}`);
        const { sourceId, surface, bottom, top } = owner;
        return { sourceId, surface, polygon: piece.vertices.map(id => result.vertices[id]), bottom, top };
      });
      return { format: source.format, sources, ground };
    }
    const owners = new Map(source.owners.map(owner => [owner.ownerId, owner]));
    return result.pieces.filter(piece => !excluded.has(piece.ownerId)).map(piece => {
      const owner = owners.get(piece.ownerId);
      if (!owner) throw invariantFailure(`ground snapshot has no metadata for owner ${piece.ownerId}`);
      const { surface, bottom, top } = owner;
      return { surface, polygon: piece.vertices.map(id => result.vertices[id]), bottom, top };
    });
  }
}
