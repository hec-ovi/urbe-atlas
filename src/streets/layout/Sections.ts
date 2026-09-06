import type { SidewalkProfile, RoadProfile } from '../construction/schema/design';
import type { SidewalkSectionRecord, StreetCrossSection } from '../construction/schema/sections';
import { resolveSidewalkGeometry } from '../construction/SidewalkGeometry';
import { invalidParams } from '../../errors';

export function sideSection(profile: SidewalkProfile): SidewalkSectionRecord {
  const { id, edge, ...bands } = profile;
  const geometry = resolveSidewalkGeometry(bands, edge);
  if (![2, 4, 6].includes(geometry.pavedWidth) || bands.curb !== 0.2 || !edge
    || edge.curbRise !== 0.2 || edge.gutter.width !== 0.3 || edge.gutter.lip.width !== 0.02 || edge.gutter.lip.height !== 0.02) {
    throw invalidParams('street grid requires 2/4/6 m paved widths, 20 cm curbs and 30 cm gutters', { profileId: id });
  }
  return { profileId: id, bands, geometry };
}

export function crossSection(runId: string, profile: RoadProfile, left: SidewalkSectionRecord, right: SidewalkSectionRecord): StreetCrossSection {
  const width = profile.lanes.reduce((sum, lane) => sum + lane.width, 0) + profile.shoulders.left + profile.shoulders.right;
  let at = width / 2 - profile.shoulders.left;
  const lanes = profile.lanes.map(lane => {
    const offset = at - lane.width / 2;
    at -= lane.width;
    return { ...lane, offset };
  });
  return { runId, profileId: profile.id, lanes, shoulders: { ...profile.shoulders }, sidewalks: { left, right } };
}
