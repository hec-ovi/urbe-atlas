import { invalidParams } from './errors';
import type { StreetDesign } from './streets/construction/schema/design';
import { roadwayTotal } from './streets/construction/Design';
import { resolveSidewalkGeometry } from './streets/construction/SidewalkGeometry';

/** Supported street construction inputs for the complete city consumer. */
export class CityConstructionSupport {
  static assert(design: StreetDesign): void {
    for (const profile of design.profiles) {
      if (!Number.isInteger(roadwayTotal(profile))) {
        throw invalidParams('generateCity requires whole-metre carriageway widths for aligned perimeter panels', {
          field: 'streetDesign.profiles', profileId: profile.id, supportedFormat: 'modules',
        });
      }
    }
    for (const profile of design.sidewalkProfiles) {
      const geometry = resolveSidewalkGeometry(profile, profile.edge);
      if (![2, 4, 6].includes(geometry.pavedWidth) || profile.curb !== 0.2 || !profile.edge
        || profile.edge.curbRise !== 0.2 || profile.edge.gutter.width !== 0.3
        || profile.edge.gutter.lip.width !== 0.02 || profile.edge.gutter.lip.height !== 0.02) {
        throw invalidParams('generateCity requires whole-panel 2/4/6 m sidewalks, a 20 cm curb and a 30 cm gutter', {
          field: 'streetDesign.sidewalkProfiles', profileId: profile.id, supportedFormat: 'modules',
        });
      }
    }
  }
}
