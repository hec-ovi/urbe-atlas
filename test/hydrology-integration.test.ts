import { describe, expect, it } from 'vitest';
import { AtlasError, generateCity } from '../src';
import { intersection } from '../src/geom/clip';
import { area, isSimpleRing } from '../src/geom/polygon';
import type { CityBlueprint, HydrologyType } from '../src';

const TYPES: HydrologyType[] = ['lagoon', 'river', 'sea-coast'];

describe('city hydrology integration', () => {
  it.each(TYPES)('generates one coherent %s city from the public API', (type) => {
    const city = generateCity({ seed: `hydro-${type}`, size: { width: 900, depth: 900 }, hydrology: { type } });
    expect(city.meta.version).toBe('0.15.0');
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
    expect(city.meta.version).toBe('0.14.0');
    expect('hydrology' in city).toBe(false);
    expect('hydrology' in city.meta.params).toBe(false);
  });

  it('fails closed through generateCity for invalid and unsatisfiable water inputs', () => {
    expect(code(() => generateCity({ seed: 'bad-water', hydrology: { type: 'ocean' as HydrologyType } }))).toBe('E_INVALID_PARAMS');
    expect(code(() => generateCity({ seed: 'small-water', size: { width: 400, depth: 400 }, hydrology: { type: 'lagoon' } }))).toBe('E_UNSATISFIABLE');
  });
});

function expectLandClear(city: CityBlueprint): void {
  const water = city.hydrology!.bodies.flatMap((body) => body.surfaces);
  for (const parcel of city.parcels) {
    expect(overlap([parcel.lot], water), `${parcel.id} lot`).toBeLessThanOrEqual(0.01);
    expect(overlap([parcel.footprint], water), `${parcel.id} footprint`).toBeLessThanOrEqual(0.01);
  }
  for (const ground of city.volumetric.ground) {
    expect(overlap([ground.polygon], water), `${ground.surface} ground`).toBeLessThanOrEqual(0.01);
  }
  for (const station of [...city.transit.trainStations, ...city.transit.subwayStations]) {
    expect(overlap([station.platform], water), `${station.id} platform`).toBeLessThanOrEqual(0.01);
  }
}

function overlap(left: CityBlueprint['parcels'][number]['lot'][], right: CityBlueprint['parcels'][number]['lot'][]): number {
  return intersection(left, right).reduce((total, polygon) => total + area(polygon), 0);
}

function code(run: () => unknown): string | undefined {
  try { run(); return undefined; } catch (error) { return error instanceof AtlasError ? error.code : String(error); }
}
