/**
 * Contract-surface tests: every declared input, output and error of
 * generateCity once, through the real entry point (CONTRACT.md).
 */
import { describe, expect, it } from 'vitest';
import { AtlasError, generateCity } from '../src';
import { orientedBoundingBox } from '../src/geom/obb';
import type { CityBlueprint, ParcelType } from '../schema/blueprint';

const PARCEL_TYPES: ParcelType[] = [
  'residential', 'hotel', 'offices', 'corpo', 'hospital', 'clinic', 'police',
  'military', 'factory', 'commerce', 'mall', 'restaurant', 'coffee_shop',
];
const TIERS = ['poor', 'mid', 'rich', 'high_rich'];

let cached: CityBlueprint | null = null;
const defaultCity = (): CityBlueprint => (cached ??= generateCity({ seed: 'contract' }));

describe('determinism', () => {
  it('same seed and params give byte-identical JSON', () => {
    const a = generateCity({ seed: 42, size: { width: 2000, depth: 2000 } });
    const b = generateCity({ seed: 42, size: { width: 2000, depth: 2000 } });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a different seed gives a different city', () => {
    const a = generateCity({ seed: 'a', size: { width: 2000, depth: 2000 } });
    const b = generateCity({ seed: 'b', size: { width: 2000, depth: 2000 } });
    expect(JSON.stringify(a.streets)).not.toBe(JSON.stringify(b.streets));
  });
});

describe('blueprint output', () => {
  it('covers every declared collection with valid shapes and refs', () => {
    const bp = defaultCity();
    expect(bp.meta.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(bp.meta.units).toBe('meters');
    expect(bp.meta.boundary.length).toBeGreaterThanOrEqual(3);

    const [dMin, dMax] = bp.meta.params.districtCount;
    expect(bp.districts.length).toBeGreaterThanOrEqual(dMin);
    expect(bp.districts.length).toBeLessThanOrEqual(dMax);

    expect(bp.streets.nodes.length).toBeGreaterThan(0);
    expect(bp.streets.edges.length).toBeGreaterThan(0);
    for (const e of bp.streets.edges.slice(0, 50)) {
      expect(['street', 'road', 'highway']).toContain(e.class);
      expect(e.width).toBeGreaterThan(0);
      expect(e.path.length).toBeGreaterThanOrEqual(2);
    }

    expect(bp.parcels.length).toBeGreaterThan(100);
    const districtIds = new Set(bp.districts.map((d) => d.id));
    const blockIds = new Set(bp.blocks.map((b) => b.id));
    for (const p of bp.parcels) {
      expect(PARCEL_TYPES).toContain(p.type);
      expect(TIERS).toContain(p.tier);
      expect(districtIds.has(p.districtId)).toBe(true);
      expect(blockIds.has(p.blockId)).toBe(true);
      expect(p.footprint.length).toBeGreaterThanOrEqual(3);
      expect(p.envelope.maxHeight).toBeCloseTo(p.envelope.maxFloors * p.envelope.floorHeight, 1);
      expect(p.envelope.minFloors).toBeGreaterThanOrEqual(1);
      expect(p.envelope.minFloors).toBeLessThanOrEqual(p.envelope.maxFloors);
      if (p.envelope.maxFloors > 6) {
        // core guarantee: footprint OBB must at least span the 10.4 x 8 core
        const obb = orientedBoundingBox(p.footprint);
        expect(obb.length).toBeGreaterThanOrEqual(10.4);
        expect(obb.width).toBeGreaterThanOrEqual(8.0);
      }
    }

    expect(bp.transit.busRoutes.length).toBeGreaterThan(0);
    expect(bp.transit.busStops.length).toBeGreaterThan(0);
    expect(bp.volumetric.buildings.length).toBe(bp.parcels.length);
    expect(bp.volumetric.ground.length).toBeGreaterThan(0);
    expect(bp.stats.population).toBeGreaterThan(0);
    expect(bp.stats.perDistrict.length).toBe(bp.districts.length);
  });

  it('keeps ids globally unique with the documented prefixes', () => {
    const bp = defaultCity();
    const all = [
      ...bp.districts.map((x) => x.id),
      ...bp.streets.nodes.map((x) => x.id),
      ...bp.streets.edges.map((x) => x.id),
      ...bp.blocks.map((x) => x.id),
      ...bp.parcels.map((x) => x.id),
      ...bp.transit.busStops.map((x) => x.id),
      ...bp.transit.busRoutes.map((x) => x.id),
      ...bp.transit.trainStations.map((x) => x.id),
      ...bp.transit.trainLines.map((x) => x.id),
      ...bp.transit.subwayStations.map((x) => x.id),
      ...bp.transit.subwayLines.map((x) => x.id),
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  it('honors feature toggles', () => {
    const bp = generateCity({
      seed: 'toggles',
      size: { width: 2000, depth: 2000 },
      features: { highways: false, subways: false, trains: false },
    });
    expect(bp.streets.edges.some((e) => e.class === 'highway')).toBe(false);
    expect(bp.transit.subwayLines).toHaveLength(0);
    expect(bp.transit.subwayStations).toHaveLength(0);
    expect(bp.transit.trainLines).toHaveLength(0);
    expect(bp.transit.trainStations).toHaveLength(0);
  });

  it('caps floors globally and per district kind', () => {
    const bp = generateCity({
      seed: 'floors',
      size: { width: 2000, depth: 2000 },
      maxFloors: 6,
      maxFloorsByDistrict: { downtown: 3 },
    });
    const downtownIds = new Set(bp.districts.filter((d) => d.kind === 'downtown').map((d) => d.id));
    for (const p of bp.parcels) {
      expect(p.envelope.maxFloors).toBeLessThanOrEqual(downtownIds.has(p.districtId) ? 3 : 6);
    }
  });

  it('every parcel access edge exists and every stop is on a route', () => {
    const bp = defaultCity();
    const edgeIds = new Set(bp.streets.edges.map((e) => e.id));
    for (const p of bp.parcels) expect(edgeIds.has(p.access.edgeId)).toBe(true);
    const routed = new Set(bp.transit.busRoutes.flatMap((r) => r.stopIds));
    for (const s of bp.transit.busStops) expect(routed.has(s.id)).toBe(true);
    const onLine = new Set(bp.transit.subwayLines.flatMap((l) => l.stationIds));
    for (const s of bp.transit.subwayStations) expect(onLine.has(s.id)).toBe(true);
    for (const r of bp.transit.busRoutes) expect(r.stopIds.length).toBeGreaterThanOrEqual(2);
    for (const l of [...bp.transit.subwayLines, ...bp.transit.trainLines]) {
      expect(l.stationIds.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('errors', () => {
  it('rejects missing seed with E_INVALID_PARAMS', () => {
    try {
      generateCity({} as never);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AtlasError);
      expect((e as AtlasError).code).toBe('E_INVALID_PARAMS');
    }
  });

  it('rejects out-of-range irregularity with E_INVALID_PARAMS', () => {
    try {
      generateCity({ seed: 1, irregularity: 2 });
      expect.unreachable();
    } catch (e) {
      expect((e as AtlasError).code).toBe('E_INVALID_PARAMS');
    }
  });

  it('rejects an impossible size/district combination with E_UNSATISFIABLE', () => {
    try {
      generateCity({ seed: 1, size: { width: 400, depth: 400 }, districtCount: [12, 14] });
      expect.unreachable();
    } catch (e) {
      expect((e as AtlasError).code).toBe('E_UNSATISFIABLE');
    }
  });
});
