import type { Polygon } from '../../../../schema/blueprint';
import { SourcePartition } from '../../../geom/partition/SourcePartition';
import type { PartitionPointEnclosure } from '../../../geom/partition/schema';

/** Query views keep the footprint and mask edges at their source coordinates. */
export class FootprintRegions {
  static outside(source: Polygon, masks: readonly Polygon[]): Polygon[] {
    return this.partition(source, masks).boundaries('outside');
  }

  static inside(source: Polygon, masks: readonly Polygon[]): Polygon[] {
    return this.partition(source, masks).boundaries('inside');
  }

  static outsideEnclosures(source: Polygon, masks: readonly Polygon[]): PartitionPointEnclosure[][] {
    return this.partition(source, masks).boundaryEnclosures('outside');
  }

  static insideEnclosures(source: Polygon, masks: readonly Polygon[]): PartitionPointEnclosure[][] {
    return this.partition(source, masks).boundaryEnclosures('inside');
  }

  private static partition(source: Polygon, masks: readonly Polygon[]): SourcePartition {
    const partition = SourcePartition.create({ id: 'source', source });
    partition.divide('source', { claims: [{ id: 'inside', masks: masks.slice() }], remainderId: 'outside' });
    return partition;
  }
}
