import { expect, it } from 'vitest';
import { generateCity } from '../index';
import { difference, intersection } from '../geom/clip';
import { area } from '../geom/polygon';
import { StreetCorridors } from '../streets/construction/StreetCorridors';
import { validateStationEntrances } from './reservations/validateStationEntrances';
import { rectangle } from './stations';

it('reserves real-city subway bay land before lots while keeping final resident statistics independent', () => {
  const city = generateCity({ seed: 'urbe' });
  const demand = city.transit.subwayDemand!;
  expect(demand.populationEstimate).toBeGreaterThan(0);
  expect(demand.lineTarget).toBe(Math.min(Math.max(Math.round(3.5 * (demand.populationEstimate / 1_000_000) ** 0.6), 1), 6));
  expect(city.transit.subwayLines).toHaveLength(demand.lineTarget);
  expect(city.stats.population).not.toBe(demand.populationEstimate);
  expect(city.stats.population).toBe(city.stats.perDistrict.reduce((sum, district) => sum + district.population, 0));
  const corridors = new StreetCorridors(city.streets.edges);
  const paving = city.volumetric.ground.filter((ground) => ground.surface === 'sidewalk').map((ground) => ground.polygon);
  const reserved = city.transit.subwayStations.flatMap((station) => station.entranceBays!.map((bay) => bay.footprint));
  const shafts = city.transit.subwayStations.flatMap((station) => station.shafts.map((shaft) => shaft.footprint));
  expect(reserved.length).toBeGreaterThan(0);
  expect(intersection(reserved, city.parcels.map((parcel) => parcel.lot)).reduce((sum, polygon) => sum + area(polygon), 0)).toBe(0);
  expect(intersection(shafts, corridors.full).reduce((sum, polygon) => sum + area(polygon), 0)).toBe(0);
  expect(difference(reserved, paving).reduce((sum, polygon) => sum + area(polygon), 0)).toBe(0);
});

it('accepts only coordinate-grid boundary wedges when rotated bay reservations are subdivided into lots', () => {
  const city = generateCity({ seed: 'c', size: { width: 300, depth: 300 } });
  const bays = city.transit.subwayStations.flatMap((station) => station.entranceBays!.map((bay) => bay.footprint));
  const shared = intersection(bays, city.parcels.map((parcel) => parcel.lot));
  expect(shared.reduce((sum, polygon) => sum + area(polygon), 0)).toBeGreaterThan(0.001);
  const entrance = city.transit.subwayStations[0].entrances[0];
  city.parcels[0].lot = rectangle(entrance, [Math.cos(city.meta.gridAngle), Math.sin(city.meta.gridAngle)], 5, 0.01);
  expect(() => validateStationEntrances(city)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT', message: expect.stringContaining('overlaps a parcel') }));
});
