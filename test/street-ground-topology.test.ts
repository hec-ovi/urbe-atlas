import { describe, expect, it } from 'vitest';
import { generateCity } from '../src';
import { bufferLine, difference, intersection, offset } from '../src/geom/clip';
import type { Polygon } from '../schema/blueprint';
import { CURB_WIDTH } from '../src/streets/widths';

/** The contract tolerates only the geometry kernel's shared-boundary slivers. */
function expectNoBand(regions: Polygon[], message: string): void {
  expect(offset(regions, -0.01), message).toHaveLength(0);
}

describe('street ground ownership', () => {
  it('covers complete carriageways and pedestrian alley widths through every junction', () => {
    const city = generateCity({
      seed: 'interior-review-1km-01',
      size: { width: 1000, depth: 1000 },
      maxFloors: 8,
      features: { highways: false, trains: false, subways: false },
    });
    const roads = city.streets.edges.filter((edge) => edge.width > 0);
    const alleys = city.streets.edges.filter((edge) => edge.class === 'alley');
    const carriageways = roads.flatMap((edge) => bufferLine(edge.path, edge.width));
    const roadGround = city.volumetric.ground.filter((region) => region.surface === 'roadway').map((region) => region.polygon);
    const sidewalkGround = city.volumetric.ground.filter((region) => region.surface === 'sidewalk').map((region) => region.polygon);
    const raisedPaving = city.volumetric.ground.filter((region) => region.surface === 'sidewalk' || region.surface === 'curb').map((region) => region.polygon);
    expect(roads.length).toBeGreaterThan(0);
    expect(alleys.length).toBeGreaterThan(0);
    for (const edge of roads) {
      const required = intersection(bufferLine(edge.path, edge.width), [city.meta.boundary]);
      expectNoBand(difference(required, roadGround), `${edge.id} full carriageway is roadway`);
    }
    for (const edge of alleys) {
      const required = difference(
        intersection(bufferLine(edge.path, edge.sidewalk.left + edge.sidewalk.right), [city.meta.boundary]),
        carriageways,
      );
      expectNoBand(difference(required, raisedPaving), `${edge.id} has continuous raised paving beyond carriageways`);
      expectNoBand(
        difference(difference(required, offset(carriageways, CURB_WIDTH)), sidewalkGround),
        `${edge.id} has no curb along its pedestrian seam`,
      );
    }
    expectNoBand(
      difference([city.meta.boundary], city.volumetric.ground.map((region) => region.polygon)),
      'all city ground has an owner',
    );
  });
});
