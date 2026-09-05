import { invalidParams } from './errors';
import type { StreetDesign } from './streets/construction/schema/design';

/** Supported street construction inputs for the complete city consumer. */
export class CityConstructionSupport {
  static assert(design: StreetDesign): void {
    for (const profile of design.sidewalkProfiles) {
      if (profile.edge !== undefined) throw invalidParams('generateCity does not support explicit sidewalk edge geometry', {
        field: 'streetDesign.sidewalkProfiles', profileId: profile.id, supportedFormat: 'curb-only',
      });
    }
  }
}
