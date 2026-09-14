import { expect, it } from 'vitest';
import { generateCity } from '../src';
import { Invariants } from '../src/invariants/Invariants';

it('generates complete four-metre-clear floor allocations and rejects insufficient pitch or capacity', () => {
  const city = generateCity({ seed: 'urbe', size: { width: 800, depth: 800 },
    features: { highways: false, subways: false } });
  expect(city.parcels.length).toBeGreaterThan(0);
  for (const parcel of city.parcels) {
    const envelope = parcel.envelope;
    expect(envelope.floorHeight).toBeGreaterThanOrEqual(4.5);
    expect(envelope.maxHeight).toBe(Math.round(envelope.maxFloors * envelope.floorHeight * 100) / 100);
    expect(envelope.maxHeight).toBeGreaterThanOrEqual(envelope.maxFloors * 4.5);
    const height = city.volumetric.buildings.find(building => building.parcelId === parcel.id)!.height;
    const selectedFloors = Math.round(height / envelope.floorHeight);
    expect(selectedFloors).toBeGreaterThanOrEqual(envelope.minFloors);
    expect(selectedFloors).toBeLessThanOrEqual(envelope.maxFloors);
    expect(height).toBe(Math.round(selectedFloors * envelope.floorHeight * 100) / 100);
  }
  const target = city.parcels.find(parcel => parcel.envelope.maxFloors > 1)!;
  expect(target).toBeDefined();
  const saved = { ...target.envelope };
  target.envelope.floorHeight = 4.4;
  expect(() => Invariants.check(city)).toThrow(/floor allocation requires at least 4.5 m pitch/);
  target.envelope = { ...saved, maxHeight: 4.5 * (saved.maxFloors - 1) };
  expect(() => Invariants.check(city)).toThrow(/floor allocation requires at least 4.5 m pitch/);
  target.envelope = saved;
}, 15000);
