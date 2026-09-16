import { expect, it } from 'vitest';
import { generateCity, BLUEPRINT_VERSION } from '../src';
import { resolveStreetDesign } from '../src/streets/construction/Design';
import { StreetReservations } from '../src/streets/layout/reservations/StreetReservations';

it('publishes native street reservations with explicit compatible cuts and referenced highways', () => {
  const city = generateCity({ seed: 'appeal-1', diagonals: 'legacy-applied', streetDesign: resolveStreetDesign(), size: { width: 800, depth: 800 } });
  const construction = city.streets.construction!;
  expect(city.meta.version).toBe(BLUEPRINT_VERSION);
  expect(city.parcels.length).toBeGreaterThan(0);
  expect(city.streets.highwayStructures.length).toBeGreaterThan(0);
  expect(construction.reservations!.protected.flatMap(reference => reference.kind === 'highway' ? [reference.structureIndex] : []))
    .toEqual(city.streets.highwayStructures.map((_, index) => index));
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
