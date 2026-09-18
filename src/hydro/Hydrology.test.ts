/** Hydrology contract: planned water, exact crossing reservations, city validation and errors. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CityBlueprint, StreetEdge } from '../../schema/blueprint';
import { AtlasError } from '../errors';
import { StreetCorridors } from '../streets/construction/StreetCorridors';
import { HYDROLOGY_FIXTURES } from './fixtures/hydrology';
import { planHydrology, withHydrologyStructures } from './Hydrology';
import { checkCityHydrology } from './CityHydrologyInvariants';
import { checkHydrology } from './HydrologyInvariants';
import type { HydroPolygon, HydrologyCrossingInput, HydrologyPlan } from './types';

const rectangle = (x0: number, z0: number, x1: number, z1: number): HydroPolygon => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const crossing: HydrologyCrossingInput = {
  network: 'street', refId: 'e0', path: [[10, 20], [110, 20]], width: 24, level: 0,
  corridor: [rectangle(10, 16, 110, 40)],
};

describe('planned water', () => {
  it('publishes stable bounded geometry per type, and no stream at all when omitted', () => {
    for (const fixture of HYDROLOGY_FIXTURES) {
      for (const seed of [fixture.seed, 'property-1', 'property-2']) {
        const request = { ...fixture, seed };
        const first = planHydrology(request)!;
        expect(JSON.stringify(planHydrology(request))).toBe(JSON.stringify(first));
        expect(() => checkHydrology(first, request.size)).not.toThrow();
        expect(first.bodies[0].type).toBe(request.config!.type);
        expect(first.bodies[0].surfaces).toHaveLength(1);
        expect(first.bodies[0].shorelines[0].closed).toBe(true);
      }
    }
    expect(planHydrology({ ...HYDROLOGY_FIXTURES[0], config: undefined })).toBeNull();
    expect(planHydrology(HYDROLOGY_FIXTURES[0])!.seedId)
      .not.toBe(planHydrology({ ...HYDROLOGY_FIXTURES[0], seed: 'different' })!.seedId);
  });
});

describe('crossing reservations', () => {
  it('reserves the exact wet part of each source footprint, clipped and separated per contact', () => {
    const plan = water(rectangle(40, 34, 60, 38));
    const result = withHydrologyStructures(plan, [crossing])!;
    expect(result.structures).toEqual([{
      id: 'ws0', kind: 'bridge', network: 'street', refId: 'e0', waterBodyId: 'w0',
      path: [[40, 20], [60, 20]], width: 24, level: 0, corridor: [rectangle(40, 34, 60, 38)],
    }]);
    expect(withHydrologyStructures(plan, [crossing])).toEqual(result);
    expect(crossing.corridor).toEqual([rectangle(10, 16, 110, 40)]);
    expect(plan.structures).toEqual([]);

    // two water bodies give two structures per source, and a subway reserves a tunnel
    const split = water(rectangle(0, 18, 50, 50), rectangle(80, 18, 120, 50));
    const inputs: HydrologyCrossingInput[] = [crossing, { ...crossing, network: 'subway', refId: 'sl0', level: -12 }];
    const separated = withHydrologyStructures(split, inputs)!.structures;
    expect(separated.map(({ kind, path, corridor }) => ({ kind, path, corridor }))).toEqual([
      { kind: 'bridge', path: [[10, 20], [50, 20]], corridor: [rectangle(10, 18, 50, 40)] },
      { kind: 'bridge', path: [[80, 20], [110, 20]], corridor: [rectangle(80, 18, 110, 40)] },
      { kind: 'tunnel', path: [[10, 20], [50, 20]], corridor: [rectangle(10, 18, 50, 40)] },
      { kind: 'tunnel', path: [[80, 20], [110, 20]], corridor: [rectangle(80, 18, 110, 40)] },
    ]);
    expect(withHydrologyStructures(split, [...inputs].reverse())!.structures).toEqual(separated);

    // a bend keeps its contact polygon, and a cap projects onto one repeated station
    const bent: HydrologyCrossingInput = {
      ...crossing, path: [[10, 20], [60, 20], [60, 70]],
      corridor: [[[10, 16], [64, 16], [64, 70], [40, 70], [40, 40], [10, 40]]],
    };
    const contact = withHydrologyStructures(water(rectangle(50, 35, 55, 45)), [bent])!.structures[0];
    expect(contact.corridor).toEqual([rectangle(50, 35, 55, 45)]);
    expect(contact.path).toEqual([[60, 35], [60, 45]]);
    const cap = withHydrologyStructures(water(rectangle(2, 18, 8, 22)),
      [{ ...crossing, corridor: [rectangle(0, 16, 110, 40)] }])!.structures[0];
    expect(cap.corridor).toEqual([rectangle(2, 18, 8, 22)]);
    expect(cap.path).toEqual([[10, 20], [10, 20]]);

    // the dry narrow side is never reserved, and a width-only crossing is classified down its centre
    const { corridor: _, ...legacy } = crossing;
    const narrow = water(rectangle(40, 9, 60, 12));
    expect(withHydrologyStructures(narrow, [crossing])!.structures).toEqual([]);
    const centered = withHydrologyStructures(narrow, [legacy])!.structures;
    expect(centered).toHaveLength(1);
    expect(centered[0].path).toEqual([[28, 20], [72, 20]]);
    expect(centered[0]).not.toHaveProperty('corridor');
    expect(withHydrologyStructures(water(rectangle(40, 34, 60, 38)), [legacy])!.structures).toEqual([]);
  });

  it('bounds contact rounding on long spans and multi-segment shorelines', () => {
    const diagonal = water([[0, 20], [100, 70], [100, 100], [0, 100]]);
    diagonal.structures = [{
      id: 'ws0', kind: 'bridge', network: 'street', refId: 'e0', waterBodyId: 'w0',
      path: [[0.001, 50], [99.001, 80]], width: 60, level: 0,
      corridor: [[[0.001, 20], [99.001, 69.5], [99.001, 90], [0.001, 90]]],
    }];
    expect(() => checkHydrology(diagonal, { width: 400, depth: 400 })).not.toThrow();
    diagonal.structures[0].corridor![0][0][1] -= 0.003;
    expect(() => checkHydrology(diagonal, { width: 400, depth: 400 })).toThrow(/outside its water contact/);

    const size = { width: 900, depth: 900 };
    const lagoon = planHydrology({ seed: 'hydro-lagoon', size, boundary: rectangle(0, 0, 900, 900), config: { type: 'lagoon' } })!;
    const corridor: HydroPolygon[] = [[
      [470, 500], [506, 500], [515.994, 515.925], [512.159, 517.583],
      [494.506, 521.75], [476.257, 522.846], [475.598, 522.772],
    ]];
    const result = withHydrologyStructures(lagoon, [{
      network: 'street', refId: 'contact', path: [[478.52, 491.245], [499.808, 525.875]], width: 38, level: 0, corridor,
    }])!;
    expect(result.structures[0].corridor).toEqual(corridor);
    expect(() => checkHydrology(result, size)).not.toThrow();
    result.structures[0].corridor![0][4][1] += 0.003;
    expect(() => checkHydrology(result, size)).toThrow(/outside its water contact/);
  });
});

describe('city validation', () => {
  it('requires an exact reservation for every wet street, legacy width and highway support', () => {
    const city = cityWith(water(rectangle(40, 34, 60, 38)));
    city.hydrology = withHydrologyStructures(city.hydrology!, [crossing])!;
    expect(() => checkCityHydrology(city)).not.toThrow();
    const missing = structuredClone(city);
    missing.hydrology!.structures = [];
    expect(() => checkCityHydrology(missing)).toThrow(/exact bridge or tunnel reservations/);
    const enlarged = structuredClone(city);
    enlarged.hydrology!.structures[0].corridor = [rectangle(39, 33, 61, 39)];
    expect(() => checkCityHydrology(enlarged)).toThrow(/outside its water contact/);
    expect(() => checkCityHydrology(cityWith(water(rectangle(40, 9, 60, 12))))).not.toThrow();

    // a saved city without construction geometry is checked against its centered width
    const legacyCity = cityWith(water(rectangle(40, 9, 60, 12)));
    delete legacyCity.streets.construction;
    const { corridor: _, ...legacy } = crossing;
    legacyCity.hydrology = withHydrologyStructures(legacyCity.hydrology!, [legacy])!;
    expect(() => checkCityHydrology(legacyCity)).not.toThrow();
    legacyCity.hydrology.structures[0].path[0][0] += 1;
    expect(() => checkCityHydrology(legacyCity)).toThrow(/exact bridge or tunnel reservations/);

    // a column standing in water belongs to a published bridge
    const carried = cityWith(water(rectangle(0, 18, 50, 50)));
    const corridor = new StreetCorridors(carried.streets.edges).byEdge.get('e0')!;
    carried.hydrology = withHydrologyStructures(carried.hydrology!, [{ ...crossing, corridor }])!;
    carried.streets.highwayStructures = [{
      edgeIds: ['e0'], path: crossing.path, width: 24, level: 8, deckThickness: 0.5,
      ramps: { start: 0, end: 0 }, elevationProfile: [{ distance: 0, level: 8 }, { distance: 100, level: 8 }],
      supports: [{ position: [21, 21], footprint: rectangle(20, 20, 22, 22), bottom: 0, top: 7.5 }],
    }];
    expect(() => checkCityHydrology(carried)).not.toThrow();
    carried.streets.highwayStructures[0].supports[0] = { position: [2, 46], footprint: rectangle(1, 45, 3, 47), bottom: 0, top: 7.5 };
    expect(() => checkCityHydrology(carried)).toThrow(/without its exact bridge reservation/);
  });
});

describe('errors', () => {
  it('fails closed for malformed requests, corridors and crossing metadata', () => {
    const code = (run: () => unknown): string | undefined => {
      try { run(); return undefined; } catch (error) { return error instanceof AtlasError ? error.code : String(error); }
    };
    expect(code(() => planHydrology({ ...HYDROLOGY_FIXTURES[0], config: { type: 'ocean' as 'lagoon' } }))).toBe('E_INVALID_PARAMS');
    expect(code(() => planHydrology({ ...HYDROLOGY_FIXTURES[0], size: { width: 300, depth: 300 } }))).toBe('E_UNSATISFIABLE');

    const plan = water(rectangle(40, 34, 60, 38));
    expect(() => withHydrologyStructures(plan, null as unknown as HydrologyCrossingInput[]))
      .toThrow(expect.objectContaining({ code: 'E_INVARIANT' }));
    for (const invalid of [
      { corridor: [] },
      { corridor: [[[0, 0], [20, 20], [0, 20], [20, 0]]] },
      { corridor: [[[0, 0], [20, 0], [20, Number.NaN]]] },
      { corridor: [rectangle(0, 0, 20, 20).reverse()] },
      { width: Number.POSITIVE_INFINITY },
      { network: 'water' },
      { refId: '' },
      { path: [[10, 20], [10, 20]] },
    ]) {
      expect(() => withHydrologyStructures(plan, [{ ...crossing, ...invalid } as HydrologyCrossingInput]))
        .toThrow(expect.objectContaining({ name: 'AtlasError', code: 'E_INVARIANT' }));
    }
    const published = withHydrologyStructures(plan, [crossing])!;
    published.structures[0].corridor = [];
    expect(() => checkHydrology(published, { width: 400, depth: 400 })).toThrow(AtlasError);
  });
});

function water(...surfaces: HydroPolygon[]): HydrologyPlan {
  return {
    seedId: 'hydro-00000000', type: 'lagoon', structures: [],
    bodies: [{
      id: 'w0', type: 'lagoon', surfaces, elevation: -0.35, depth: 6, materialKey: 'water.lagoon',
      shorelines: surfaces.map((path, index) => ({
        id: `sh${index}`, path, closed: true, band: path.map((a, edge) => {
          const b = path[(edge + 1) % path.length];
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const x = -(b[1] - a[1]) / length * 0.2;
          const z = (b[0] - a[0]) / length * 0.2;
          return [a, b, [b[0] + x, b[1] + z], [a[0] + x, a[1] + z]];
        }),
      })),
    }],
  };
}

function cityWith(hydrology: HydrologyPlan): CityBlueprint {
  const city = JSON.parse(readFileSync(new URL('../../samples/city-urbe-tiny.json', import.meta.url), 'utf8')) as CityBlueprint;
  const edge: StreetEdge = {
    id: 'e0', class: 'street', from: 'n0', to: 'n1', path: crossing.path, width: 7,
    sidewalk: { left: 16.5, right: 0.5 }, districtIds: [], level: 0,
    elevationProfile: [{ distance: 0, level: 0 }, { distance: 100, level: 0 }],
  };
  city.streets = {
    nodes: edge.path.map((position, index) => ({ id: `n${index}`, position, edgeIds: ['e0'], connections: [{ level: 0, edgeIds: ['e0'] }] })),
    edges: [edge], crossings: [], planting: [], signals: [], highwayStructures: [],
    construction: { version: '1.0.0', runs: [{ id: 'sr0', profileId: 'test', edges: [{ edgeId: 'e0', forward: true, start: 0, end: 100 }], path: edge.path, length: 100 }] },
  };
  city.parcels = [];
  city.blocks = [];
  city.transit.trainStations = [];
  city.transit.subwayStations = [];
  city.transit.trainLines = [];
  city.transit.subwayLines = [];
  city.volumetric.ground = [];
  city.hydrology = hydrology;
  return city;
}
