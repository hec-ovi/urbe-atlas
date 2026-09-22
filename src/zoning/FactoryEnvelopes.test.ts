import { describe, expect, it } from 'vitest';
import type { Envelope, Polygon, Vec2 } from '../../schema/blueprint';
import type { PlannedDistrict } from '../districts/DistrictPlanner';
import { TemplateBands } from '../blocks/TemplateBands';
import { Rng } from '../core/rng';
import { factoryEnvelope } from './FactoryEnvelopes';
import { FootprintHost } from './FootprintHost';
import { hostingProfile } from './profiles';
import { Zoning } from './Zoning';

const SEED = 'factory-envelope-policy';
const original: Envelope = Object.freeze({ minFloors: 2, maxFloors: 2, floorHeight: 10, maxHeight: 20 });
const borrowed: Envelope = Object.freeze({ minFloors: 8, maxFloors: 12, floorHeight: 10, maxHeight: 120 });
const rectangle = (width: number, depth: number, x = 0, z = 0): Polygon =>
  [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]];
const lot = {
  type: 'factory' as const, lot: rectangle(24, 32), footprint: rectangle(18, 26, 3, 3),
  district: { kind: 'industrial' as const, maxFloors: 40 }, floorCap: Infinity, original,
};

function selectedSlot(): string {
  for (let index = 0; index < 100; index++) {
    const slot = `industrial#${index}`;
    if (factoryEnvelope(borrowed, { ...lot, slot }, SEED).maxFloors > 2) return slot;
  }
  throw new Error('fixture has no selected industrial slot');
}

describe('factory envelopes', () => {
  it('keeps a low majority and a stable one-third tower subset across independent slots', () => {
    const envelopes = Array.from({ length: 3000 }, (_, index) =>
      factoryEnvelope(borrowed, { ...lot, slot: `industrial#${index}` }, SEED));
    const towers = envelopes.filter(envelope => envelope.minFloors === 3);
    expect(towers.length).toBeGreaterThan(900);
    expect(towers.length).toBeLessThan(1100);
    expect(new Set(towers.map(envelope => envelope.maxFloors))).toEqual(new Set([3, 4, 5, 6]));
    for (const envelope of towers) {
      expect(envelope.floorHeight).toBe(10);
      expect(envelope.maxHeight).toBe(envelope.maxFloors * 10);
    }
    for (const envelope of envelopes.filter(envelope => envelope.minFloors !== 3)) expect(envelope).toBe(original);
    expect(envelopes).toEqual(Array.from({ length: 3000 }, (_, index) =>
      factoryEnvelope(borrowed, { ...lot, slot: `industrial#${index}` }, SEED)));
    expect(original).toEqual({ minFloors: 2, maxFloors: 2, floorHeight: 10, maxHeight: 20 });
  });

  it('requires the industrial use, adequate lot and hosted footprint, and at least three permitted floors', () => {
    const slot = selectedSlot();
    expect(factoryEnvelope(borrowed, { ...lot, slot }, SEED).minFloors).toBe(3);
    const rotate = (polygon: Polygon): Polygon => polygon.map(([x, z]): Vec2 =>
      [(x - z) / Math.SQRT2, (x + z) / Math.SQRT2]);
    expect(factoryEnvelope(borrowed, { ...lot, slot,
      lot: rotate(rectangle(24, 32, 1000, 1000)), footprint: rotate(rectangle(18, 26, 1003, 1003)),
    }, SEED).minFloors).toBe(3);
    for (const change of [
      { district: { kind: 'mixed' as const, maxFloors: 40 } },
      { lot: rectangle(23.5, 40) }, { lot: rectangle(40, 23.5) },
      { footprint: rectangle(17.5, 40) }, { footprint: rectangle(40, 17.5) },
      { lot: rotate(rectangle(23, 40)) }, { footprint: rotate(rectangle(17, 40)) },
      { district: { kind: 'industrial' as const, maxFloors: 2 } }, { floorCap: 2 },
    ]) expect(factoryEnvelope(borrowed, { ...lot, slot, ...change }, SEED)).toBe(original);
  });

  it('caps every selected tower at its district and hosted core while preserving the low envelope', () => {
    for (const maxFloors of [1, 2, 3, 4, 5, 6, 40]) {
      for (const floorCap of [1, 2, 3, 4, 6, Infinity]) {
        const cap = Math.min(maxFloors, floorCap);
        for (let index = 0; index < 60; index++) {
          const envelope = factoryEnvelope(borrowed, { ...lot, slot: `industrial#${index}`, floorCap,
            district: { kind: 'industrial', maxFloors } }, SEED);
          expect(envelope.maxFloors).toBeLessThanOrEqual(Math.min(6, cap));
          expect(envelope.minFloors).toBeLessThanOrEqual(envelope.maxFloors);
          expect(envelope.minFloors).toBe(envelope.maxFloors > 2 ? 3 : Math.min(2, cap));
          expect(envelope.maxHeight).toBe(envelope.maxFloors * 10);
        }
      }
    }
  });

  it('shares decisions by template slot and canonical lot geometry without changing unrelated template bands', () => {
    const slot = selectedSlot();
    const first = factoryEnvelope(borrowed, { ...lot, slot }, SEED);
    expect(factoryEnvelope(borrowed, { ...lot, slot, lot: rectangle(24, 32, 100, 200) }, SEED)).toEqual(first);
    const untemplated = factoryEnvelope(borrowed, lot, SEED);
    expect(factoryEnvelope(borrowed, { ...lot, lot: [...lot.lot].reverse() }, SEED)).toEqual(untemplated);
    expect(factoryEnvelope(borrowed, { ...lot, lot: [...lot.lot.slice(1), lot.lot[0]] }, SEED)).toEqual(untemplated);

    const bands = new TemplateBands();
    const shared = bands.apply(slot, original);
    expect(factoryEnvelope(shared, { ...lot, slot }, SEED).minFloors).toBe(3);
    const next = bands.apply(slot, borrowed);
    expect(next).toEqual(original);
    expect(factoryEnvelope(next, { ...lot, slot, type: 'offices' }, SEED)).toBe(next);
    expect(factoryEnvelope(borrowed, { ...lot, type: 'residential' }, SEED)).toBe(borrowed);
  });

  it('adds both factory forms after real zoning and hosting without changing parcel uses, tiers or random streams', () => {
    const host = new FootprintHost({ grid: { origin: [0, 0], angle: 0, spacing: 0.5 } });
    const district: PlannedDistrict = { index: 0, center: [300, 300], kind: 'industrial', tier: 'poor', maxFloors: 6, radius: 500 };
    const lots = Array.from({ length: 90 }, (_, index) => ({
      polygon: rectangle(40, 56, (index % 10) * 60, Math.floor(index / 10) * 70), districtIndex: 0, onRoad: true,
    }));
    const rng = Rng.from(SEED, 'zoning');
    const parcels = Zoning.assign(lots, [district], district.center, rng, host);
    const untouched = structuredClone(parcels);
    const rngControl = Rng.from(SEED, 'zoning');
    expect(Zoning.assign(lots, [district], district.center, rngControl, host)).toEqual(parcels);
    let low = 0, towers = 0;
    const towerMaxima = new Set<number>();
    for (const parcel of parcels) {
      const polygon = lots[parcel.lotIndex].polygon;
      const hosted = host.fit(polygon, hostingProfile(parcel.type))!;
      const envelope = factoryEnvelope(parcel.envelope, {
        type: parcel.type, lot: polygon, ...hosted, district, original: parcel.envelope,
      }, SEED);
      if (parcel.type !== 'factory') expect(envelope).toBe(parcel.envelope);
      else {
        expect(hosted.floorCap).toBe(Infinity);
        if (envelope.minFloors === 3) { towers++; towerMaxima.add(envelope.maxFloors); }
        else { low++; expect(envelope).toBe(parcel.envelope); }
      }
    }
    expect(towers).toBeGreaterThan(10);
    expect(low).toBeGreaterThan(towers);
    expect(towerMaxima).toEqual(new Set([3, 4, 5, 6]));
    expect(parcels).toEqual(untouched);
    expect(rng.next()).toBe(rngControl.next());
  });
});
