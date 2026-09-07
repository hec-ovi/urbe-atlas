import { expect, it } from 'vitest';
import { generateCity } from '../src';

it('generates highways and subways with empty surface transit compatibility collections', () => {
  const city = generateCity({ seed: 'subway-city', size: { width: 600, depth: 600 }, features: { trains: true } });
  expect(city.meta.params.features.trains).toBe(false);
  expect(city.transit.busRoutes).toEqual([]);
  expect(city.transit.busStops).toEqual([]);
  expect(city.transit.trainLines).toEqual([]);
  expect(city.transit.trainStations).toEqual([]);
  expect(city.transit.subwayLines.length).toBeGreaterThan(0);
  expect(city.transit.subwayStations.length).toBeGreaterThanOrEqual(2);
  expect(city.streets.highwayStructures).toHaveLength(1);
  expect(city.streets.highwayStructures[0].supports.length).toBeGreaterThan(0);
  expect(city.parcels.length).toBeGreaterThan(0);
}, 45000);
