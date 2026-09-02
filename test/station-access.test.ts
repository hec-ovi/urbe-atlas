import { describe, expect, it } from 'vitest';
import { generateCity } from '../src';
import { pointInPolygon } from '../src/geom/polygon';
import { checkStations } from '../src/invariants/stations';
import type { CityBlueprint, Vec3 } from '../schema/blueprint';

const distance3 = (a: Vec3, b: Vec3): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('station access paths', () => {
  it('publishes a continuous switchback route from every subway entrance to its platform', () => {
    const bp = generateCity({ seed: 'station-access', size: { width: 1600, depth: 1600 } });
    expect(bp.transit.subwayStations.length).toBeGreaterThan(0);
    for (const station of bp.transit.subwayStations) {
      expect(station.accessPaths).toHaveLength(station.entrances.length);
      station.accessPaths.forEach((access, i) => {
        const stair = access.segments[0];
        expect(stair.kind).toBe('stairs');
        expect(stair.path.length).toBeGreaterThanOrEqual(5);
        expect(stair.path[0]).toEqual([station.entrances[i][0], 0, station.entrances[i][1]]);
        const stairDistance = stair.path.slice(1).reduce(
          (sum, point, p) => sum + distance3(stair.path[p], point),
          0,
        );
        expect(stairDistance).toBeGreaterThan(Math.abs(station.level));
        for (const [x, , z] of stair.path) {
          expect(pointInPolygon([x, z], station.shafts[i].footprint)).toBe(true);
        }
        const handoff = access.platformHandoff;
        expect(handoff[1]).toBe(station.level);
        expect(pointInPolygon([handoff[0], handoff[2]], station.platform)).toBe(true);
        const lastSegment = access.segments[access.segments.length - 1];
        expect(lastSegment.path[lastSegment.path.length - 1]).toEqual(handoff);
      });
    }
  });

  it('rejects a missing access route', () => {
    const bp = generateCity({ seed: 'station-access-invalid', size: { width: 1600, depth: 1600 } });
    const broken = structuredClone(bp) as CityBlueprint;
    broken.transit.subwayStations[0].accessPaths.pop();
    expect(() => checkStations(broken)).toThrow(/access paths/);
  });

  it('rejects an instant vertical stair edge', () => {
    const bp = generateCity({ seed: 'station-access-vertical', size: { width: 1600, depth: 1600 } });
    const broken = structuredClone(bp) as CityBlueprint;
    const station = broken.transit.subwayStations[0];
    const entrance = station.entrances[0];
    station.accessPaths[0].segments[0].path = [
      [entrance[0], 0, entrance[1]],
      [entrance[0], station.level, entrance[1]],
    ];
    expect(() => checkStations(broken)).toThrow(/vertical or non-descending flight/);
  });
});
