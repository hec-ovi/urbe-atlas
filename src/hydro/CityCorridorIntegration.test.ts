import { expect, it } from 'vitest';
import { generateCity } from '../index';
import { checkCityHydrology } from './CityHydrologyInvariants';

it('keeps a coast city valid across millimetre-rounded corridor contacts', () => {
  const city = generateCity({
    seed: 'hydro-sea-coast', size: { width: 900, depth: 900 },
    hydrology: { type: 'sea-coast' }, features: { trains: false, subways: false },
  });
  expect(city.hydrology!.structures.some((structure) => structure.corridor)).toBe(true);
  expect(() => checkCityHydrology(city)).not.toThrow();
});
