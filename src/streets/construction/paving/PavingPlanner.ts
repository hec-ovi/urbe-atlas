import { resolvePavingDesign } from './Design';
import { SourcePartition } from '../../../geom/partition/SourcePartition';
import { validateInput, validateSharedInput } from './Input';
import { bounds } from './Geometry';
import { Ownership } from './Ownership';
import { Regions } from './Regions';
import { SourcePaving } from './SourcePaving';
import { PublishedPaving } from './PublishedPaving';
import { publishGround, type GroundMetadata } from './Publication';
import type { PavingInput, PavingOutput, PublishedPavingInput, SharedPavingInput } from './producer-schema';
import type { PavingDesign } from './schema';

export class PavingPlanner {
  static validateDesign(input: unknown): PavingDesign {
    return resolvePavingDesign(input);
  }

  static validatePublished(input: PublishedPavingInput): void {
    PublishedPaving.validate(input);
  }

  static plan(input: PavingInput): PavingOutput {
    const design = PavingPlanner.validateDesign(input.design);
    validateInput(input, design);
    const ownership = new Ownership(input), regions = new Regions(design);
    const districts = PavingPlanner.districts(input, design);
    return {
      ground: input.ground.flatMap(source => {
        if (source.surface !== 'curb' && source.surface !== 'sidewalk') return [source];
        const partition = SourcePartition.create({ id: 'source', source: source.polygon });
        const semantic = { surface: source.surface, bottom: source.bottom, top: source.top };
        const metadata = new SourcePaving(partition, 'source', semantic, regions.source(source), ownership, regions,
          design.defaultLayoutId, districts, false).refine();
        return publishGround(partition, source.polygon, metadata);
      }),
      construction: regions.construction,
    };
  }

  static planShared(input: SharedPavingInput): PavingOutput {
    const design = PavingPlanner.validateDesign(input.design);
    validateSharedInput(input, design);
    const ownership = new Ownership(input, true), regions = new Regions(design);
    const districts = PavingPlanner.districts(input, design);
    const { partition, boundary, coordinateScale, owners, excludedOwnerIds } = input.groundSource;
    const metadata = new Map<string, GroundMetadata>();
    for (const owner of owners) {
      const source = { surface: owner.surface, bottom: owner.bottom, top: owner.top };
      if (source.surface !== 'curb' && source.surface !== 'sidewalk') {
        metadata.set(owner.ownerId, source);
      } else if (partition.boundaries(owner.ownerId).length) {
        const fitted = new SourcePaving(partition, owner.ownerId, source, regions.source(source), ownership, regions,
          design.defaultLayoutId, districts, true).refine();
        for (const [id, value] of fitted) metadata.set(id, value);
      }
    }
    return { ground: publishGround(partition, boundary, metadata, excludedOwnerIds, coordinateScale),
      construction: regions.construction };
  }

  private static districts(input: Omit<PavingInput, 'ground'>, design: PavingDesign) {
    const overrides = new Map(design.districtLayouts.map(override => [override.districtId, override.layoutId]));
    return input.districts.filter(district => overrides.has(district.id)
      && overrides.get(district.id) !== design.defaultLayoutId).sort((a, b) => a.id.localeCompare(b.id)).map(district => ({
      layoutId: overrides.get(district.id)!,
      polygons: [district.boundary], bounds: bounds([district.boundary]),
    }));
  }
}
