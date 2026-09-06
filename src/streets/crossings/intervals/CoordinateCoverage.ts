import type { Polygon } from '../../../../schema/blueprint';
import { SourcePartition } from '../../../geom/partition/SourcePartition';
import type { PartitionPointEnclosure, PreparedPartitionMasks } from '../../../geom/partition/schema';

/** Refines the exact uncovered owner with the complete coordinate cover. */
export class CoordinateCoverage {
  static missing(source: Polygon, allowed: PreparedPartitionMasks,
    cover: () => PreparedPartitionMasks): PartitionPointEnclosure[][] {
    const partition = SourcePartition.create({ id: 'source', source });
    partition.divide('source', { claims: [{ id: 'allowed', masks: [], preparedMasks: allowed }], remainderId: 'missing' });
    if (!partition.boundaryEnclosures('missing').length) return [];
    partition.divide('missing', { claims: [{ id: 'cover', masks: [], preparedMasks: cover() }], remainderId: 'outside' });
    return partition.boundaryEnclosures('outside');
  }
}
