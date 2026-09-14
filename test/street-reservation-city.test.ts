import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { generateCity } from '../src';
import { StreetReservations } from '../src/streets/layout/reservations/StreetReservations';

it('publishes native street reservations through normal generation while retaining the baseline highway', () => {
  const city = generateCity({ seed: 'appeal-1', size: { width: 800, depth: 800 } });
  const construction = city.streets.construction!;
  expect(city.meta.version).toBe('0.22.0');
  expect(city.parcels).toHaveLength(175);
  expect(createHash('sha256').update(JSON.stringify(city.streets.highwayStructures)).digest('hex'))
    .toBe('b330d73a2c3ad5714dfdd87a24a3fd1006730e3010d64cc80bbb9ec4c0c81680');
  expect(construction.reservations!.version).toBe('1.0.0');
  expect(construction.reservations!.parking.length).toBeGreaterThan(0);
  expect(construction.modules!.parking!.every(bay => bay.profile === 'native')).toBe(true);
  expect(construction.reservations!.protected.filter(value => value.kind === 'station-bay')).toHaveLength(4);
  expect(construction.reservations!.protected.some(value => value.kind === 'underpass')).toBe(true);
  const saved = JSON.parse(JSON.stringify(city));
  expect(() => StreetReservations.validate(saved.streets.construction.reservations, { ...saved, modules: saved.streets.construction.modules })).not.toThrow();
}, 15000);

it('publishes empty infrastructure protections when highways and stations are disabled', () => {
  const city = generateCity({ seed: 'street-reservations', size: { width: 400, depth: 400 },
    features: { highways: false, subways: false } });
  const reservations = city.streets.construction!.reservations!;
  expect(reservations.protected).toEqual([]);
  expect(reservations.owners.some(owner => owner.kind === 'perimeter')).toBe(true);
});
