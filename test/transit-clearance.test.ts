/** Transit geometry that reaches grade must stay outside building footprints. */
import { describe, expect, it } from 'vitest';
import { generateCity } from '../src';
import { bufferLine, intersection, offset, union } from '../src/geom/clip';
import { area, bounds } from '../src/geom/polygon';
import type { Polygon } from '../schema/blueprint';
import { HIGHWAY_DECK } from '../src/streets/Highways';
import { RAIL } from '../src/transit/stations';

function overlapArea(a: Polygon[], b: Polygon): number {
  const bb = bounds(b);
  const nearby = a.filter((polygon) => {
    const aa = bounds(polygon);
    return aa.min[0] < bb.max[0] && aa.max[0] > bb.min[0] && aa.min[1] < bb.max[1] && aa.max[1] > bb.min[1];
  });
  return nearby.length === 0 ? 0 : intersection(nearby, [b]).reduce((sum, polygon) => sum + area(polygon), 0);
}

describe('transit construction clearance', () => {
  for (const [seed, size] of [['urbe', 1000], ['contract', 1000], [42, 2000], ['urbe', 3000]] as const) {
    it(`keeps grade infrastructure arithmetically clear for ${seed} at ${size} m`, () => {
      const bp = generateCity({ seed, size: { width: size, depth: size } });
      const gradeRail = union([
        ...bp.transit.trainLines.flatMap((line) => bufferLine(line.path, line.width + RAIL.buildingClearance * 2)),
        ...bp.transit.trainStations.flatMap((station) => offset([station.platform], RAIL.buildingClearance)),
      ]);
      const highwayDecks = bp.streets.highwayStructures.flatMap((structure) =>
        bufferLine(structure.path, structure.width + HIGHWAY_DECK.buildingClearance * 2));
      for (const parcel of bp.parcels) {
        expect(overlapArea(gradeRail, parcel.footprint), `train track and ${parcel.id}`).toBeLessThanOrEqual(1e-6);
        for (const station of bp.transit.trainStations) {
          expect(overlapArea([station.platform], parcel.footprint), `${station.id} platform and ${parcel.id}`).toBeLessThanOrEqual(1e-6);
        }
        for (const station of bp.transit.subwayStations) {
          for (let i = 0; i < station.shafts.length; i++) {
            expect(overlapArea([station.shafts[i].footprint], parcel.footprint), `${station.id} shaft ${i} and ${parcel.id}`).toBeLessThanOrEqual(1e-6);
          }
        }
      }
      for (const station of bp.transit.trainStations) {
        expect(overlapArea(highwayDecks, station.platform), `${station.id} platform and highway deck`).toBeLessThanOrEqual(1e-6);
      }
      const shafts = bp.transit.subwayStations.flatMap((station) => station.shafts.map((shaft) => shaft.footprint));
      for (const structure of bp.streets.highwayStructures) {
        for (const support of structure.supports) {
          expect(overlapArea([...gradeRail, ...shafts], support.footprint), `${structure.edgeIds[0]} support and grade infrastructure`).toBeLessThanOrEqual(1e-6);
        }
      }
    });
  }
});
