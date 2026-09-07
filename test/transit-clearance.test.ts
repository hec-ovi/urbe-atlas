/** Transit geometry that reaches grade must stay outside building footprints. */
import { describe, expect, it } from 'vitest';
import { generateCity } from '../src';
import { intersection } from '../src/geom/clip';
import { area, bounds } from '../src/geom/polygon';
import type { Polygon } from '../schema/blueprint';

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
      for (const parcel of bp.parcels) {
        for (const station of bp.transit.subwayStations) {
          for (let i = 0; i < station.shafts.length; i++) {
            expect(overlapArea([station.shafts[i].footprint], parcel.footprint), `${station.id} shaft ${i} and ${parcel.id}`).toBeLessThanOrEqual(1e-6);
          }
        }
      }
      const shafts = bp.transit.subwayStations.flatMap((station) => station.shafts.map((shaft) => shaft.footprint));
      for (const structure of bp.streets.highwayStructures) {
        for (const support of structure.supports) {
          expect(overlapArea(shafts, support.footprint), `${structure.edgeIds[0]} support and grade infrastructure`).toBeLessThanOrEqual(1e-6);
        }
      }
    }, size === 3000 ? 30000 : size === 2000 ? 15000 : undefined); // Full-city generation and clearance checks.
  }
});
