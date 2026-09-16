import { invalidParams } from './errors';
import type { StreetDesign } from './streets/construction/schema/design';
import { roadwayTotal } from './streets/construction/Design';
import { resolveSidewalkGeometry } from './streets/construction/SidewalkGeometry';

/** Supported street construction inputs for the complete city consumer. */
export class CityConstructionSupport {
  static assert(design: StreetDesign): void {
    const district = design.moduleFormat === 'district';
    const roadPitch = district ? 0.2 : 1;
    for (const profile of design.profiles) {
      const stations = roadwayTotal(profile) / roadPitch;
      if (Math.abs(stations - Math.round(stations)) > 1e-8) {
        throw invalidParams(`generateCity requires carriageway widths on a ${roadPitch} m grid`, {
          field: 'streetDesign.profiles', profileId: profile.id, supportedFormat: 'modules',
        });
      }
    }
    for (const profile of design.sidewalkProfiles) {
      const geometry = resolveSidewalkGeometry(profile, profile.edge);
      const supportedWidth = district ? Math.abs(geometry.pavedWidth - 4.2) < 1e-8 : [2, 4, 6].includes(geometry.pavedWidth);
      if (!supportedWidth || profile.curb !== 0.2 || !profile.edge
        || profile.edge.curbRise !== 0.2 || profile.edge.gutter.width !== (district ? 0.5 : 0.3)
        || profile.edge.gutter.lip.width !== 0.02 || profile.edge.gutter.lip.height !== 0.02) {
        throw invalidParams(district
          ? 'generateCity requires 4.2 m district sidewalks, a 20 cm curb and a 50 cm gutter'
          : 'generateCity requires whole-panel 2/4/6 m sidewalks, a 20 cm curb and a 30 cm gutter', {
          field: 'streetDesign.sidewalkProfiles', profileId: profile.id, supportedFormat: 'modules',
        });
      }
    }
  }
}
