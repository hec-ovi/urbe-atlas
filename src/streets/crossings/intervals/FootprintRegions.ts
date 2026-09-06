import type { Polygon } from '../../../../schema/blueprint';
import { coordinateCover, hasInteriorBeyondPrecision } from '../../../geom/clip';
import { prepareMasks } from '../../../geom/partition/PreparedMasks';
import { SourcePartition } from '../../../geom/partition/SourcePartition';
import type { PartitionPointEnclosure, PreparedPartitionMasks } from '../../../geom/partition/schema';
import { CoordinateCoverage } from './CoordinateCoverage';

/** An immutable field shares validated mask geometry, never query ownership or acceptance. */
export class FootprintRegions {
  readonly empty: boolean;
  private readonly polygons: Polygon[];
  private readonly masks: PreparedPartitionMasks;
  private cover?: PreparedPartitionMasks;

  constructor(masks: readonly Polygon[]) {
    this.polygons = masks.map(polygon => polygon.map(([x, z]) => [x, z]));
    this.masks = prepareMasks({ masks: this.polygons });
    this.empty = masks.length === 0;
  }

  covers(source: Polygon): boolean { return this.missing(source).length === 0; }
  intersects(source: Polygon): boolean { return hasInteriorBeyondPrecision(this.inside(source)); }
  overlapsArea(source: Polygon): boolean { return this.inside(source).length > 0; }

  missing(source: Polygon): PartitionPointEnclosure[][] {
    return CoordinateCoverage.missing(source, this.masks, () =>
      this.cover ??= prepareMasks({ masks: coordinateCover(this.polygons) }));
  }

  inside(source: Polygon): Polygon[] { return this.partition(source).boundaries('inside'); }
  outside(source: Polygon): Polygon[] { return this.partition(source).boundaries('outside'); }
  insideEnclosures(source: Polygon): PartitionPointEnclosure[][] { return this.partition(source).boundaryEnclosures('inside'); }
  outsideEnclosures(source: Polygon): PartitionPointEnclosure[][] { return this.partition(source).boundaryEnclosures('outside'); }

  static covers(source: Polygon, allowed: readonly Polygon[]): boolean {
    return new FootprintRegions(allowed).covers(source);
  }

  static outside(source: Polygon, masks: readonly Polygon[]): Polygon[] {
    return new FootprintRegions(masks).outside(source);
  }

  static inside(source: Polygon, masks: readonly Polygon[]): Polygon[] {
    return new FootprintRegions(masks).inside(source);
  }

  static outsideEnclosures(source: Polygon, masks: readonly Polygon[]): PartitionPointEnclosure[][] {
    return new FootprintRegions(masks).outsideEnclosures(source);
  }

  static insideEnclosures(source: Polygon, masks: readonly Polygon[]): PartitionPointEnclosure[][] {
    return new FootprintRegions(masks).insideEnclosures(source);
  }

  private partition(source: Polygon): SourcePartition {
    const partition = SourcePartition.create({ id: 'source', source });
    partition.divide('source', { claims: [{ id: 'inside', masks: [], preparedMasks: this.masks }], remainderId: 'outside' });
    return partition;
  }
}
