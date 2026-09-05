import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CityBlueprint, StreetEdge } from '../../schema/blueprint';
import { AtlasError } from '../errors';
import { StreetCorridors } from '../streets/construction/StreetCorridors';
import { planHydrology, withHydrologyStructures } from './Hydrology';
import { checkCityHydrology } from './CityHydrologyInvariants';
import { checkHydrology } from './HydrologyInvariants';
import type { HydroPolygon, HydrologyCrossingInput, HydrologyPlan } from './types';

const rectangle = (x0: number, z0: number, x1: number, z1: number): HydroPolygon => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const crossing: HydrologyCrossingInput = {
  network: 'street', refId: 'e0', path: [[10, 20], [110, 20]], width: 24, level: 0,
  corridor: [rectangle(10, 16, 110, 40)],
};

describe('exact hydrology corridor contract', () => {
  it('reserves the full wide-side water contact and names its source stations', () => {
    const plan = water(rectangle(40, 34, 60, 38));
    const result = withHydrologyStructures(plan, [crossing])!;
    expect(result.structures).toEqual([{
      id: 'ws0', kind: 'bridge', network: 'street', refId: 'e0', waterBodyId: 'w0',
      path: [[40, 20], [60, 20]], width: 24, level: 0,
      corridor: [rectangle(40, 34, 60, 38)],
    }]);
    expect(withHydrologyStructures(plan, [crossing])).toEqual(result);
    expect(crossing.corridor).toEqual([rectangle(10, 16, 110, 40)]);
    expect(plan.structures).toEqual([]);
  });

  it('keeps the narrow side clear and preserves centered legacy classification', () => {
    const { corridor: _, ...legacy } = crossing;
    const narrow = water(rectangle(40, 9, 60, 12));
    expect(withHydrologyStructures(narrow, [crossing])!.structures).toEqual([]);
    const result = withHydrologyStructures(narrow, [legacy])!.structures;
    expect(result).toHaveLength(1);
    expect(result[0].path).toEqual([[28, 20], [72, 20]]);
    expect(result[0]).not.toHaveProperty('corridor');
    expect(withHydrologyStructures(water(rectangle(40, 34, 60, 38)), [legacy])!.structures).toEqual([]);
  });

  it('clips separate contacts to the source footprint for both bridge and tunnel reservations', () => {
    const plan = water(rectangle(0, 18, 50, 50), rectangle(80, 18, 120, 50));
    const inputs: HydrologyCrossingInput[] = [crossing, { ...crossing, network: 'subway', refId: 'sl0', level: -12 }];
    const result = withHydrologyStructures(plan, inputs)!.structures;
    expect(result.map(({ kind, path, corridor }) => ({ kind, path, corridor }))).toEqual([
      { kind: 'bridge', path: [[10, 20], [50, 20]], corridor: [rectangle(10, 18, 50, 40)] },
      { kind: 'bridge', path: [[80, 20], [110, 20]], corridor: [rectangle(80, 18, 110, 40)] },
      { kind: 'tunnel', path: [[10, 20], [50, 20]], corridor: [rectangle(10, 18, 50, 40)] },
      { kind: 'tunnel', path: [[80, 20], [110, 20]], corridor: [rectangle(80, 18, 110, 40)] },
    ]);
    expect(withHydrologyStructures(plan, [...inputs].reverse())!.structures).toEqual(result);
  });

  it('keeps bent-path contact polygons and terminal-cap reservations exact', () => {
    const bent: HydrologyCrossingInput = {
      ...crossing, path: [[10, 20], [60, 20], [60, 70]],
      corridor: [[[10, 16], [64, 16], [64, 70], [40, 70], [40, 40], [10, 40]]],
    };
    const plan = water(rectangle(50, 35, 55, 45));
    const contact = withHydrologyStructures(plan, [bent])!.structures[0];
    expect(contact.corridor).toEqual([rectangle(50, 35, 55, 45)]);
    expect(contact.path).toEqual([[60, 35], [60, 45]]);
    const cap = withHydrologyStructures(water(rectangle(2, 18, 8, 22)), [{
      ...crossing, corridor: [rectangle(0, 16, 110, 40)],
    }])!.structures[0];
    expect(cap.corridor).toEqual([rectangle(2, 18, 8, 22)]);
    expect(cap.path).toEqual([[10, 20], [10, 20]]);
  });

  it('checks exact city reservations against the published sides and rejects missing or enlarged permits', () => {
    const city = cityWith(water(rectangle(40, 34, 60, 38)));
    city.hydrology = withHydrologyStructures(city.hydrology!, [crossing])!;
    expect(() => checkCityHydrology(city)).not.toThrow();
    const missing = structuredClone(city);
    missing.hydrology!.structures = [];
    expect(() => checkCityHydrology(missing)).toThrow(/exact bridge or tunnel reservations/);
    const enlarged = structuredClone(city);
    enlarged.hydrology!.structures[0].corridor = [rectangle(39, 33, 61, 39)];
    expect(() => checkCityHydrology(enlarged)).toThrow(/outside its water contact/);
    const clear = cityWith(water(rectangle(40, 9, 60, 12)));
    expect(() => checkCityHydrology(clear)).not.toThrow();
  });

  it('validates old cities against their centered source widths', () => {
    const city = cityWith(water(rectangle(40, 9, 60, 12)));
    delete city.streets.construction;
    const { corridor: _, ...legacy } = crossing;
    city.hydrology = withHydrologyStructures(city.hydrology!, [legacy])!;
    expect(() => checkCityHydrology(city)).not.toThrow();
    city.hydrology.structures[0].path[0][0] += 1;
    expect(() => checkCityHydrology(city)).toThrow(/exact bridge or tunnel reservations/);
  });

  it('covers wet highway supports with the matching bridge footprint', () => {
    const city = cityWith(water(rectangle(0, 18, 50, 50)));
    const corridor = new StreetCorridors(city.streets.edges).byEdge.get('e0')!;
    city.hydrology = withHydrologyStructures(city.hydrology!, [{ ...crossing, corridor }])!;
    city.streets.highwayStructures = [{
      edgeIds: ['e0'], path: crossing.path, width: 24, level: 8, deckThickness: 0.5,
      ramps: { start: 0, end: 0 }, elevationProfile: [{ distance: 0, level: 8 }, { distance: 100, level: 8 }],
      supports: [{ position: [21, 21], footprint: rectangle(20, 20, 22, 22), bottom: 0, top: 7.5 }],
    }];
    expect(() => checkCityHydrology(city)).not.toThrow();
    city.streets.highwayStructures[0].supports[0] = { position: [2, 46], footprint: rectangle(1, 45, 3, 47), bottom: 0, top: 7.5 };
    expect(() => checkCityHydrology(city)).toThrow(/without its exact bridge reservation/);
  });

  it('bounds rounded shoreline contact error by distance across long diagonal spans', () => {
    const plan = water([[0, 20], [100, 70], [100, 100], [0, 100]]);
    plan.structures = [{
      id: 'ws0', kind: 'bridge', network: 'street', refId: 'e0', waterBodyId: 'w0',
      path: [[0.001, 50], [99.001, 80]], width: 60, level: 0,
      corridor: [[[0.001, 20], [99.001, 69.5], [99.001, 90], [0.001, 90]]],
    }];
    expect(() => checkHydrology(plan, { width: 400, depth: 400 })).not.toThrow();
    plan.structures[0].corridor![0][0][1] -= 0.003;
    expect(() => checkHydrology(plan, { width: 400, depth: 400 })).toThrow(/outside its water contact/);
  });

  it('accepts exact contact through several connected shoreline segments', () => {
    const size = { width: 900, depth: 900 };
    const plan = planHydrology({ seed: 'hydro-lagoon', size, boundary: rectangle(0, 0, 900, 900), config: { type: 'lagoon' } })!;
    const corridor: HydroPolygon[] = [[
      [470, 500], [506, 500], [515.994, 515.925], [512.159, 517.583],
      [494.506, 521.75], [476.257, 522.846], [475.598, 522.772],
    ]];
    const result = withHydrologyStructures(plan, [{
      network: 'street', refId: 'contact', path: [[478.52, 491.245], [499.808, 525.875]],
      width: 38, level: 0, corridor,
    }])!;
    expect(result.structures).toHaveLength(1);
    expect(result.structures[0].corridor).toEqual(corridor);
    expect(() => checkHydrology(result, size)).not.toThrow();
    result.structures[0].corridor![0][4][1] += 0.003;
    expect(() => checkHydrology(result, size)).toThrow(/outside its water contact/);
  });

  it('rejects malformed exact corridors and crossing metadata with deterministic contract errors', () => {
    const plan = water(rectangle(40, 34, 60, 38));
    expect(() => withHydrologyStructures(plan, null as unknown as HydrologyCrossingInput[])).toThrow(expect.objectContaining({ code: 'E_INVARIANT' }));
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
      const run = () => withHydrologyStructures(plan, [{ ...crossing, ...invalid } as HydrologyCrossingInput]);
      expect(run).toThrow(expect.objectContaining({ name: 'AtlasError', code: 'E_INVARIANT' }));
    }
    const planWithInvalid = withHydrologyStructures(plan, [crossing])!;
    planWithInvalid.structures[0].corridor = [];
    expect(() => checkHydrology(planWithInvalid, { width: 400, depth: 400 })).toThrow(AtlasError);
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
