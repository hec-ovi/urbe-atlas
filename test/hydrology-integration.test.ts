import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AtlasError, generateCity, BLUEPRINT_VERSION } from '../src';
import { intersection } from '../src/geom/clip';
import { area, isSimpleRing } from '../src/geom/polygon';
import type { AtlasParams, CityBlueprint, HydrologyType } from '../src';

const TYPES: HydrologyType[] = ['lagoon', 'river', 'sea-coast'];
const coastParams = (): AtlasParams => JSON.parse(readFileSync(new URL('./fixtures/coast-city.params.json', import.meta.url), 'utf8'));

describe('city hydrology integration', () => {
  it.each(TYPES)('generates one coherent %s city from the public API', (type) => {
    const city = generateCity({ seed: `hydro-${type}`, size: { width: 900, depth: 900 }, hydrology: { type } });
    expect(city.meta.version).toBe(BLUEPRINT_VERSION);
    expect(city.meta.params.hydrology).toEqual({ type });
    expect(city.hydrology).toMatchObject({ type, bodies: [{ type }] });
    const body = city.hydrology!.bodies[0];
    expect(body.surfaces.every(isSimpleRing)).toBe(true);
    expect(body.shorelines.every((shoreline) => shoreline.closed && isSimpleRing(shoreline.path))).toBe(true);
    expect(body.materialKey).toBe(`water.${type}`);
    expectLandClear(city);
  });

  it('keeps a water city byte-identical for the same seed and params', () => {
    const params = { seed: 'hydro-repeat', size: { width: 800, depth: 800 }, hydrology: { type: 'river' } } as const;
    const first = generateCity(params);
    const second = generateCity(params);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expectLandClear(first);
  });

  it('keeps the no-water output shape backward compatible', () => {
    const city = generateCity({ seed: 'no-water', size: { width: 800, depth: 800 } });
    expect(city.meta.version).toBe(BLUEPRINT_VERSION);
    expect('hydrology' in city).toBe(false);
    expect('hydrology' in city.meta.params).toBe(false);
  });

  // generateCity validates its own ground against water, so reaching the end is the land-clearance proof.
  it('stops the perimeter ring at a shoreline that reaches the city boundary', () => {
    // the sea takes the whole south edge of this 3 x 1.2 km coast: that side loses its ring, the dry sides keep theirs
    expect(ring(generateCity(coastParams()))).toEqual({ regions: 18, frontages: 3, corners: 2 });

    // a river reaching two opposite edges cuts those sides in half instead of removing them
    expect(ring(generateCity({ seed: 'wide-river', size: { width: 2000, depth: 900 }, hydrology: { type: 'river' } })))
      .toEqual({ regions: 42, frontages: 6, corners: 4 });

    // water clear of the boundary leaves the ring whole
    expect(ring(generateCity({ seed: 'edge-lagoon', size: { width: 1400, depth: 1400 }, hydrology: { type: 'lagoon' } })))
      .toEqual({ regions: 36, frontages: 4, corners: 4 });
  });

  it('fails closed through generateCity for invalid and unsatisfiable water inputs', () => {
    expect(code(() => generateCity({ seed: 'bad-water', hydrology: { type: 'ocean' as HydrologyType } }))).toBe('E_INVALID_PARAMS');
    expect(code(() => generateCity({ seed: 'small-water', size: { width: 400, depth: 400 }, hydrology: { type: 'lagoon' } }))).toBe('E_UNSATISFIABLE');
  });
});

/** What survives of the city's outer sidewalk ring. */
function ring(city: CityBlueprint): { regions: number; frontages: number; corners: number } {
  const reservations = city.streets.construction!.reservations!;
  return {
    regions: city.volumetric.ground.filter((ground) => ground.moduleBlockId === 'fringe').length,
    frontages: reservations.frontages.filter((frontage) => frontage.ownerId === 'fringe').length,
    corners: reservations.corners.filter((corner) => corner.ownerId === 'fringe').length,
  };
}

function expectLandClear(city: CityBlueprint): void {
  const water = city.hydrology!.bodies.flatMap((body) => body.surfaces);
  for (const parcel of city.parcels) {
    expect(overlap([parcel.lot], water), `${parcel.id} lot`).toBeLessThanOrEqual(0.01);
    expect(overlap([parcel.footprint], water), `${parcel.id} footprint`).toBeLessThanOrEqual(0.01);
  }
  for (const ground of city.volumetric.ground) {
    expect(overlap([ground.polygon], water), `${ground.surface} ground`).toBeLessThanOrEqual(0.01);
  }
  for (const station of city.transit.subwayStations) {
    expect(overlap([station.platform], water), `${station.id} platform`).toBeLessThanOrEqual(0.01);
  }
}

function overlap(left: CityBlueprint['parcels'][number]['lot'][], right: CityBlueprint['parcels'][number]['lot'][]): number {
  return intersection(left, right).reduce((total, polygon) => total + area(polygon), 0);
}

function code(run: () => unknown): string | undefined {
  try { run(); return undefined; } catch (error) { return error instanceof AtlasError ? error.code : String(error); }
}
