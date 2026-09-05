import type { Polygon } from '../../../../schema/blueprint';
import { SourcePartition } from '../../../geom/partition/SourcePartition';
import type { PartitionPointEnclosure } from '../../../geom/partition/schema';

/** Refines the exact uncovered owner with the complete coordinate cover. */
export class CoordinateCoverage {
  static missing(source: Polygon, allowed: Polygon[], cover: Polygon[]): PartitionPointEnclosure[][] {
    const partition = SourcePartition.create({ id: 'source', source });
    partition.divide('source', { claims: [{ id: 'allowed', masks: allowed }], remainderId: 'missing' });
    partition.divide('missing', { claims: [{ id: 'cover', masks: cover }], remainderId: 'outside' });
    return partition.boundaryEnclosures('outside');
  }
}
