/** Construction-ready street surfaces and crossing markings. */
import { describe, expect, it } from 'vitest';
import { generateCity } from '../src';
import { area } from '../src/geom/polygon';
import { checkCrossings } from '../src/invariants/crossings';
import { checkGroundCover } from '../src/invariants/groundCover';
import { CROSSING } from '../src/streets/Crossings';
import { GROUND_LEVELS } from '../src/streets/surfaces';

describe('street construction surfaces', () => {
  it('publishes exact ground levels and whole crossing stripes for urbe', () => {
    const city = generateCity({ seed: 'urbe', size: { width: 1000, depth: 1000 } });
    for (const region of city.volumetric.ground) {
      expect({ bottom: region.bottom, top: region.top }).toEqual(GROUND_LEVELS[region.surface]);
    }
    expect(GROUND_LEVELS.curb.top - GROUND_LEVELS.roadway.top).toBe(0.15);
    expect(city.streets.crossings.length).toBeGreaterThan(0);
    for (const crossing of city.streets.crossings) {
      for (const segment of crossing.segments) {
        expect(segment.edgeId).toMatch(/^e\d+$/);
        expect(segment.width).toBe(CROSSING.width);
        expect(segment.markings.length).toBeGreaterThan(0);
        for (const marking of segment.markings) {
          const edge = city.streets.edges.find((candidate) => candidate.id === segment.edgeId)!;
          expect(Math.abs(area(marking) - edge.width * CROSSING.stripeLength)).toBeLessThan(0.01);
        }
      }
    }
  });

  it('rejects a curb without its rise', () => {
    const city = structuredClone(generateCity({ seed: 'surface-invalid', size: { width: 600, depth: 600 } }));
    const curb = city.volumetric.ground.find((region) => region.surface === 'curb')!;
    curb.top = curb.bottom;
    expect(() => checkGroundCover(city)).toThrow(/curb has invalid construction levels/);
  });

  it('rejects a crossing without fitted marking geometry', () => {
    const city = structuredClone(generateCity({ seed: 'crossing-invalid', size: { width: 600, depth: 600 } }));
    city.streets.crossings[0].segments[0].markings = [];
    expect(() => checkCrossings(city)).toThrow(/incomplete marking dimensions/);
  });
});
