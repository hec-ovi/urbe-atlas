import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { AtlasParams } from '../../schema/params';
import type { CityBlueprint, Parcel, ParcelType } from '../../schema/blueprint';
import { generateCity } from '..';
import { applyLandmarkFloors } from './index';

const params: AtlasParams = {
  seed: 'landmark-floors',
  size: { width: 400, depth: 400 },
  districtCount: [1, 1],
  maxFloors: 110,
  tierWeights: { poor: 0, mid: 0, rich: 0, high_rich: 1 },
  features: { highways: false, subways: false, alleys: false },
};

let source: CityBlueprint;
let towers: Parcel[];
const digest = (city: CityBlueprint): string => createHash('sha256').update(JSON.stringify(city)).digest('hex');
beforeAll(() => {
  source = generateCity(params);
  towers = (['corpo', 'offices', 'hotel'] satisfies ParcelType[]).map(type => {
    const parcel = source.parcels.find(candidate => candidate.type === type && candidate.envelope.maxFloors > 6);
    expect(parcel, `${type} landmark fixture`).toBeDefined();
    return parcel!;
  });
});

describe('landmark floor authoring', () => {
  it('sets exact 80-floor envelopes and prisms while preserving source and city geometry', () => {
    const original = digest(source);
    const floors = Object.fromEntries(towers.map(parcel => [parcel.id, 80]));
    const authored = applyLandmarkFloors(source, floors);
    expect(authored).not.toBe(source);
    expect(digest(source)).toBe(original);
    expect(source.meta.params).not.toHaveProperty('landmarkFloors');
    expect(authored.meta.params.landmarkFloors).toEqual(floors);
    expect(authored.streets).toBe(source.streets);
    expect(authored.blocks).toBe(source.blocks);
    expect(authored.districts).toBe(source.districts);
    expect(authored.transit).toBe(source.transit);
    expect(authored.stats).toBe(source.stats);
    expect(authored.volumetric.ground).toBe(source.volumetric.ground);
    expect(authored.parcels.map(parcel => parcel.id)).toEqual(source.parcels.map(parcel => parcel.id));
    for (const parcel of authored.parcels) {
      const prior = source.parcels.find(candidate => candidate.id === parcel.id)!;
      if (floors[parcel.id]) {
        expect(parcel).toEqual({ ...prior, envelope: {
          ...prior.envelope, minFloors: 80, maxFloors: 80,
          maxHeight: Math.round(80 * prior.envelope.floorHeight * 100) / 100,
        } });
        expect(parcel.footprint).toBe(prior.footprint);
        expect(parcel.access).toBe(prior.access);
        expect(authored.volumetric.buildings.find(building => building.parcelId === parcel.id)?.height).toBe(parcel.envelope.maxHeight);
      } else {
        expect(parcel).toBe(prior);
      }
    }
    const generated = generateCity(authored.meta.params);
    expect(digest(generated)).toBe(digest(authored));
  });

  it('retains prior selections and allows an empty selection', () => {
    const first = applyLandmarkFloors(source, { [towers[0].id]: 80 });
    const second = applyLandmarkFloors(first, { [towers[1].id]: 70 });
    expect(second.meta.params.landmarkFloors).toEqual({ [towers[0].id]: 80, [towers[1].id]: 70 });
    expect(second.parcels.find(parcel => parcel.id === towers[0].id)?.envelope.minFloors).toBe(80);
    expect(digest(applyLandmarkFloors(second, {}))).toBe(digest(second));
    expect(digest(generateCity(second.meta.params))).toBe(digest(second));
  });

  it('rejects malformed maps and floor values at both public entries', () => {
    for (const floors of [null, [], new Date(), { '': 80 }, { p0: 0 }, { p0: 2.5 }, { p0: Infinity }, { p0: '80' }]) {
      expect(() => applyLandmarkFloors(source, floors as never)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
      expect(() => generateCity({ ...params, landmarkFloors: floors as never })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    }
  });

  it('rejects unknown parcels, incompatible uses, walkup envelopes and excess floors without changing the source', () => {
    const original = digest(source);
    const unsupported = source.parcels.find(parcel => !['corpo', 'offices', 'hotel'].includes(parcel.type))!;
    expect(unsupported).toBeDefined();
    for (const floors of [{ missing: 80 }, { [unsupported.id]: 80 }, { [towers[0].id]: 111 }]) {
      expect(() => applyLandmarkFloors(source, floors)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    }
    const walkup = { ...source, parcels: source.parcels.map(parcel => parcel.id === towers[0].id
      ? { ...parcel, envelope: { ...parcel.envelope, minFloors: 1, maxFloors: 6 } } : parcel) };
    expect(() => applyLandmarkFloors(walkup, { [towers[0].id]: 80 })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    expect(digest(source)).toBe(original);
  });

  it('rejects incomplete selected-parcel references', () => {
    for (const incomplete of [
      { ...source, districts: [] },
      { ...source, volumetric: { ...source.volumetric, buildings: [] } },
    ]) {
      expect(() => applyLandmarkFloors(incomplete, { [towers[0].id]: 80 })).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    }
  });
});
