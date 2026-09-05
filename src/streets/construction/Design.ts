import type { LaneDesign, RoadProfile, SidewalkBands, SidewalkProfile, StreetDesign } from './schema/design';
import { invalidParams } from '../../errors';
import { CURB_WIDTH } from '../widths';

const lanes = (count: number): LaneDesign[] => Array.from({ length: count }, (_, index) => ({
  direction: index < count / 2 ? 'backward' : 'forward', width: 3.5,
}));

export function sidewalkTotal(bands: SidewalkBands): number {
  return bands.curb + bands.border + bands.furnishing + bands.walking + bands.frontage;
}

export function roadwayTotal(profile: RoadProfile): number {
  return profile.shoulders.left + profile.shoulders.right + profile.lanes.reduce((sum, lane) => sum + lane.width, 0);
}

export function resolveStreetDesign(input?: StreetDesign): StreetDesign {
  const defaults: StreetDesign = {
    profiles: [
      { id: 'local', classes: ['street'], lanes: lanes(2), shoulders: { left: 0, right: 0 } },
      { id: 'avenue', classes: ['road'], lanes: lanes(4), shoulders: { left: 0, right: 0 } },
      { id: 'boulevard', classes: ['road'], lanes: lanes(6), shoulders: { left: 0, right: 0 } },
    ],
    sidewalkProfiles: [
      { id: 'compact', curb: CURB_WIDTH, border: 0.35, furnishing: 0.5, walking: 1.5, frontage: 0.5 },
      { id: 'standard', curb: CURB_WIDTH, border: 0.35, furnishing: 1, walking: 2.5, frontage: 0.5 },
      { id: 'broad', curb: CURB_WIDTH, border: 0.35, furnishing: 1.5, walking: 3.5, frontage: 1 },
      { id: 'promenade', curb: CURB_WIDTH, border: 0.35, furnishing: 2, walking: 4.5, frontage: 1.5 },
    ],
  };
  const value = input === undefined ? defaults : input;
  if (!record(value) || !Array.isArray(value.profiles) || value.profiles.length === 0
    || !Array.isArray(value.sidewalkProfiles) || value.sidewalkProfiles.length === 0) fail('must contain road and sidewalk profiles');
  const roadIds = new Set<string>();
  for (const [index, profile] of value.profiles.entries()) {
    const field = `profiles[${index}]`;
    if (!record(profile)) fail(`${field} must be an object`);
    claimId(profile.id, roadIds, field);
    if (!Array.isArray(profile.classes) || profile.classes.length === 0
      || profile.classes.some((kind: unknown) => kind !== 'street' && kind !== 'road')
      || new Set(profile.classes).size !== profile.classes.length) fail(`${field}.classes must list street or road once`);
    if (!Array.isArray(profile.lanes) || profile.lanes.length < 2) fail(`${field}.lanes must carry both directions`);
    for (const lane of profile.lanes) {
      if (!record(lane) || !positive(lane.width)
        || (lane.direction !== 'forward' && lane.direction !== 'backward')) fail(`${field}.lanes has invalid dimensions or direction`);
    }
    if (!profile.lanes.some((lane: LaneDesign) => lane.direction === 'forward')
      || !profile.lanes.some((lane: LaneDesign) => lane.direction === 'backward')) fail(`${field}.lanes must carry both directions`);
    if (!record(profile.shoulders) || !nonnegative(profile.shoulders.left) || !nonnegative(profile.shoulders.right)) fail(`${field}.shoulders must be nonnegative metres`);
  }
  for (const kind of ['street', 'road']) {
    if (!value.profiles.some((profile: RoadProfile) => (profile.classes as string[]).includes(kind))) fail(`profiles must include ${kind}`);
  }
  const sidewalkIds = new Set<string>();
  for (const [index, profile] of value.sidewalkProfiles.entries()) {
    const field = `sidewalkProfiles[${index}]`;
    if (!record(profile)) fail(`${field} must be an object`);
    claimId(profile.id, sidewalkIds, field);
    if (profile.curb !== CURB_WIDTH) fail(`${field}.curb must equal ${CURB_WIDTH} metres`);
    for (const key of ['border', 'furnishing', 'frontage'] as const) {
      if (!nonnegative(profile[key])) fail(`${field}.${key} must be nonnegative metres`);
    }
    if (!positive(profile.walking)) fail(`${field}.walking must be positive metres`);
  }
  return {
    profiles: value.profiles.map((profile: RoadProfile) => ({
      id: profile.id, classes: [...profile.classes], lanes: profile.lanes.map((lane) => ({ ...lane })), shoulders: { ...profile.shoulders },
    })).sort((a: RoadProfile, b: RoadProfile) => roadwayTotal(a) - roadwayTotal(b) || a.id.localeCompare(b.id)),
    sidewalkProfiles: value.sidewalkProfiles.map((profile: SidewalkProfile) => ({ ...profile }))
      .sort((a: SidewalkProfile, b: SidewalkProfile) => sidewalkTotal(a) - sidewalkTotal(b) || a.id.localeCompare(b.id)),
  };
}

function record(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function claimId(id: unknown, ids: Set<string>, field: string): void {
  if (typeof id !== 'string' || id.length === 0 || ids.has(id)) fail(`${field}.id must be unique and nonempty`);
  ids.add(id as string);
}

function fail(message: string): never {
  throw invalidParams(`streetDesign ${message}`, { field: 'streetDesign' });
}
