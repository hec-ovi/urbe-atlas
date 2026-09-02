/** Subway lines end at constructed terminal platforms, never as bare track. */
import { describe, expect, it } from 'vitest';
import { generateCity } from '../src';
import { Invariants } from '../src/invariants/Invariants';
import { distanceToOutline, pointInPolygon } from '../src/geom/polygon';

describe('subway terminals', () => {
  it('contains both ends of the reported urbe line in its terminal platforms', () => {
    const city = generateCity({ seed: 'urbe', size: { width: 1000, depth: 1000 } });
    const byId = new Map(city.transit.subwayStations.map((station) => [station.id, station]));
    expect(city.transit.subwayLines.length).toBeGreaterThan(0);
    for (const line of city.transit.subwayLines) {
      const terminals = [byId.get(line.stationIds[0])!, byId.get(line.stationIds[line.stationIds.length - 1])!];
      const endpoints = [line.path[0], line.path[line.path.length - 1]];
      terminals.forEach((station, index) => {
        const endpoint = endpoints[index];
        expect(
          pointInPolygon(endpoint, station.platform) || distanceToOutline(endpoint, station.platform) <= 1e-6,
          `${line.id} endpoint ${index} must be owned by ${station.id}`,
        ).toBe(true);
        expect(station.position).not.toEqual(endpoint);
      });
    }
  });

  it('rejects a subway line endpoint outside its terminal platform', () => {
    const city = structuredClone(generateCity({ seed: 'urbe', size: { width: 1000, depth: 1000 } }));
    const line = city.transit.subwayLines[0];
    line.path[0] = [line.path[0][0] + 200, line.path[0][1] + 200];
    expect(() => Invariants.check(city)).toThrow(/start leaves terminal platform/);
  });
});
