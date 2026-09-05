import type { GroundSurface, Polygon } from '../../../../schema/blueprint';
import { invariantFailure } from '../../../errors';
import type { SourcePartition } from '../../../geom/partition/SourcePartition';
import { verifyPartition } from '../../../geom/partition/verifyPartition';

export type GroundMetadata = Omit<GroundSurface, 'polygon'>;

export function publishGround(partition: SourcePartition, source: Polygon, metadata: Map<string, GroundMetadata>,
  excludedOwnerIds: readonly string[] = [], coordinateScale?: 1000): GroundSurface[] {
  const result = partition.finish();
  verifyPartition({ source, partition: result, ...(coordinateScale ? { coordinateScale } : {}) });
  const excluded = new Set(excludedOwnerIds);
  return result.pieces.flatMap(piece => {
    if (excluded.has(piece.ownerId)) return [];
    const owner = metadata.get(piece.ownerId);
    if (!owner || piece.fixed !== (owner.construction?.part.kind === 'grid')) {
      throw invariantFailure('paving partition owner has no matching metadata', { ownerId: piece.ownerId });
    }
    return [{ ...owner, polygon: piece.vertices.map(index => result.vertices[index]) }];
  });
}
