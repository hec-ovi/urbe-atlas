import { invariantFailure } from '../../../errors';
import { verifyPublishedCover } from '../../../geom/partition/published/verifyPublishedCover';
import { PublishedCells } from './PublishedCells';
import { PublishedReferences } from './PublishedReferences';
import type { PublishedPavingInput } from './producer-schema';

export class PublishedPaving {
  static validate(city: PublishedPavingInput): void {
    const references = new PublishedReferences(city);
    if (!Array.isArray(city.volumetric?.ground) || !Array.isArray(city.meta?.boundary)
      || city.hydrology !== undefined && !Array.isArray(city.hydrology.bodies)) {
      throw invariantFailure('published paving needs the city boundary, ground and declared water');
    }
    const exclusions = (city.hydrology?.bodies ?? []).flatMap(body => {
      if (!Array.isArray(body?.surfaces)) throw invariantFailure('published paving water body has no surfaces');
      return body.surfaces;
    });
    for (const ground of city.volumetric.ground) {
      const region = references.ground(ground);
      if (region) PublishedCells.validate(ground, region, references.layouts.get(region.layoutId)!,
        references.frames.get(region.frameId)!, references.construction.version);
    }
    references.complete();
    verifyPublishedCover({ boundary: city.meta.boundary, exclusions,
      pieces: city.volumetric.ground.map((ground, index) => ({ id: `ground:${index}`, polygon: ground.polygon })) });
  }
}
