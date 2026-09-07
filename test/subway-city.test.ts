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
  const highway = city.streets.highwayStructures[0];
  expect(highway.width).toBe(14);
  expect(highway.supports.length).toBeGreaterThan(0);
  const across = highway.path[0][0] === highway.path.at(-1)![0] ? 0 : 1;
  const position = highway.path[0][across];
  expect(city.parcels.some(parcel => parcel.footprint.every(point => point[across] < position))).toBe(true);
  expect(city.parcels.some(parcel => parcel.footprint.every(point => point[across] > position))).toBe(true);
  const crossings = city.streets.nodes.filter(node => node.connections.some(group => group.level === 8)
    && node.connections.some(group => group.level === 0));
  expect(crossings.length).toBeGreaterThan(0);
  for (const node of crossings) {
    expect(node.connections.find(group => group.level === 8)!.edgeIds.every(id => highway.edgeIds.includes(id))).toBe(true);
    expect(node.connections.find(group => group.level === 0)!.edgeIds.every(id => !highway.edgeIds.includes(id))).toBe(true);
  }
  expect(city.parcels.length).toBeGreaterThan(0);
}, 45000);
