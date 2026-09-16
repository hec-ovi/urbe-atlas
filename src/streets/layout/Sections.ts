import type { SidewalkProfile, RoadProfile } from '../construction/schema/design';
import type { SidewalkSectionRecord, StreetCrossSection } from '../construction/schema/sections';
import { resolveSidewalkGeometry } from '../construction/SidewalkGeometry';
import { invalidParams } from '../../errors';
import { laneSections } from '../construction/LaneSections';

export function sideSection(profile: SidewalkProfile): SidewalkSectionRecord {
  const { id, edge, ...bands } = profile;
  const geometry = resolveSidewalkGeometry(bands, edge);
  const paving = Math.round(geometry.pavedWidth * 1000) / 1000;
  const supported = [2, 4, 6].includes(paving) && edge?.gutter.width === 0.3
    || paving === 4.2 && edge?.gutter.width === 0.5;
  if (!supported || bands.curb !== 0.2 || !edge
    || edge.curbRise !== 0.2 || edge.gutter.lip.width !== 0.02 || edge.gutter.lip.height !== 0.02) {
    throw invalidParams('street grid requires 2/4/6 m paved widths, 20 cm curbs and 30 cm gutters', { profileId: id });
  }
  return { profileId: id, bands, geometry };
}

export function crossSection(runId: string, profile: RoadProfile, left: SidewalkSectionRecord, right: SidewalkSectionRecord): StreetCrossSection {
  return { runId, profileId: profile.id, lanes: laneSections(profile), shoulders: { ...profile.shoulders },
    ...(profile.median ? { median: { ...profile.median } } : {}), sidewalks: { left, right } };
}
