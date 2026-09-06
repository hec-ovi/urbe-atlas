/**
 * Contract-surface tests: every declared input, output and error of
 * generateCity once, through the real entry point (CONTRACT.md).
 */
import { describe, expect, it } from 'vitest';
import { AtlasError, generateCity } from '../src';
import { bandWidth } from '../src/geom/band';
import { orientedBoundingBox } from '../src/geom/obb';
import { pointInPolygon } from '../src/geom/polygon';
import { PLANTING_CLEARANCE, PLANTING_SPACING } from '../src/streets/Planting';
import type { CityBlueprint, ParcelType, Vec2 } from '../schema/blueprint';

const PARCEL_TYPES: ParcelType[] = [
  'residential', 'hotel', 'offices', 'corpo', 'hospital', 'clinic', 'police',
  'military', 'factory', 'commerce', 'mall', 'restaurant', 'coffee_shop',
];
const TIERS = ['poor', 'mid', 'rich', 'high_rich'];

/** Shortest floor each type's family builds, mirrored from exterior's floor constants. */
const MIN_FLOOR_HEIGHT: Record<ParcelType, number> = {
  residential: 2.6, hotel: 2.8, offices: 3.4, corpo: 3.6, hospital: 3.8, clinic: 3.8,
  police: 3.0, military: 3.0, factory: 4.5, commerce: 3.0, mall: 3.0, restaurant: 3.0, coffee_shop: 3.0,
};

/** Core hosting rectangles, [length, depth] meters, and the band each type keeps end to end (CONTRACT.md). */
const HEAVY_TYPES = new Set<ParcelType>(['offices', 'corpo', 'hotel', 'hospital', 'mall', 'factory']);
const WALKUP = [11.14, 9.74];
const WALKUP_TWO_STAIRS = [17.64, 9.74];
const COMPACT = [12.14, 13.74];
const STANDARD = [20.14, 9.74];
const minBand = (type: ParcelType): number => (HEAVY_TYPES.has(type) ? 12.14 : 9.74);

let cached: CityBlueprint | null = null;
const defaultCity = (): CityBlueprint => (cached ??= generateCity({ seed: 'contract' }));

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

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
      expect(['street', 'road', 'highway', 'alley']).toContain(e.class);
      if (e.class === 'alley') expect(e.width).toBe(0);
      else expect(e.width).toBeGreaterThan(0);
      expect(e.path.length).toBeGreaterThanOrEqual(2);
    }

    expect(bp.parcels.length).toBeGreaterThan(0);
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
      // the envelope admits at least one floor of the type's family
      expect(p.envelope.maxHeight).toBeGreaterThanOrEqual(MIN_FLOOR_HEIGHT[p.type]);
      // band guarantee: the footprint keeps its type's band end to end
      expect(bandWidth(p.footprint), `${p.id} ${p.type} band`).toBeGreaterThanOrEqual(minBand(p.type) - 1e-6);
      // core guarantees: the footprint OBB at least spans the rectangle its type and floors need
      const obb = orientedBoundingBox(p.footprint);
      const spans = (rect: number[]): boolean => obb.length >= Math.max(...rect) - 1e-6 && obb.width >= Math.min(...rect) - 1e-6;
      expect(spans(WALKUP), `${p.id} walkup core`).toBe(true);
      if (HEAVY_TYPES.has(p.type)) expect(spans(COMPACT), `${p.id} ${p.type} compact core`).toBe(true);
      if (p.envelope.maxFloors > 6) expect(spans(COMPACT) || spans(STANDARD), `${p.id} elevator core`).toBe(true);
      else if (p.envelope.maxFloors > 4) {
        expect(spans(WALKUP_TWO_STAIRS) || spans(COMPACT) || spans(STANDARD), `${p.id} two-stair core`).toBe(true);
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
      ...(bp.streets.construction?.runs ?? []).map((x) => x.id),
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
  }, 15000); // One complete 2 km generation and its invariants.

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
  }, 15000); // One complete 2 km generation and its invariants.

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

  it('gives every station a platform, and every underground one a shaft per entrance', () => {
    const bp = defaultCity();
    expect(bp.transit.subwayStations.length).toBeGreaterThan(0);
    for (const st of [...bp.transit.subwayStations, ...bp.transit.trainStations]) {
      expect(st.platform.length, `${st.id} platform`).toBeGreaterThanOrEqual(3);
      expect(pointInPolygon(st.position, st.platform), `${st.id} platform covers its position`).toBe(true);
      expect(st.box.bottom, `${st.id} box floor`).toBe(st.level);
      expect(st.box.top, `${st.id} box ceiling`).toBeGreaterThan(st.box.bottom);
      if (st.level >= 0) {
        expect(st.shafts, `${st.id} is at grade`).toEqual([]);
        continue;
      }
      expect(st.shafts.length, `${st.id} shafts`).toBe(st.entrances.length);
      st.shafts.forEach((shaft, i) => {
        expect(shaft.top).toBe(0);
        expect(shaft.bottom).toBe(st.level);
        expect(pointInPolygon(st.entrances[i], shaft.footprint), `${st.id} shaft ${i} on its entrance`).toBe(true);
      });
    }
  });
});

describe('street furniture', () => {
  it('signals every arm of a signalled junction, with a mast square to the head', () => {
    const bp = defaultCity();
    expect(bp.streets.signals.length).toBeGreaterThan(0);
    const nodeById = new Map(bp.streets.nodes.map((n) => [n.id, n]));
    const edgeById = new Map(bp.streets.edges.map((e) => [e.id, e]));
    const armsOf = new Map<string, string[]>();
    for (const signal of bp.streets.signals) {
      const node = nodeById.get(signal.nodeId);
      const edge = edgeById.get(signal.edgeId);
      expect(node, signal.nodeId).toBeDefined();
      expect(edge, signal.edgeId).toBeDefined();
      expect(node!.edgeIds).toContain(signal.edgeId);
      // a deck overhead and a pedestrian cut are not arms of traffic
      expect(['street', 'road']).toContain(edge!.class);
      expect(Math.hypot(...signal.facing)).toBeCloseTo(1, 9);
      expect(Math.hypot(...signal.mast.direction)).toBeCloseTo(1, 9);
      expect(signal.facing[0] * signal.mast.direction[0] + signal.facing[1] * signal.mast.direction[1]).toBeCloseTo(0, 9);
      // the mast reaches from the kerb to the centerline of the arm it stops
      expect(signal.mast.length).toBeGreaterThan(edge!.width / 2);
      expect(signal.junctionId).toBeDefined();
      armsOf.set(signal.junctionId!, [...(armsOf.get(signal.junctionId!) ?? []), signal.edgeId]);
    }
    for (const [junctionId, arms] of armsOf) {
      const drivable = bp.streets.construction!.junctions!.find((junction) => junction.id === junctionId)!.approaches.map((approach) => approach.edgeId);
      expect(arms.sort(), `${junctionId} heads`).toEqual(drivable.sort());
      expect(arms.length).toBeGreaterThanOrEqual(3);
      expect(drivable.some((id) => edgeById.get(id)!.class === 'road'), `${junctionId} carries a road`).toBe(true);
    }
  });

  it('plants the sidewalks at the district spacing, clear of every way in', () => {
    const bp = defaultCity();
    expect(bp.streets.planting.length).toBeGreaterThan(0);
    const edgeById = new Map(bp.streets.edges.map((e) => [e.id, e]));
    const clear: Vec2[] = [
      ...bp.streets.crossings.flatMap((c) => c.segments.flatMap((seg) => [seg.from, seg.to])),
      ...bp.transit.busStops.map((s) => s.position),
      ...[...bp.transit.trainStations, ...bp.transit.subwayStations].flatMap((s) => s.entrances),
      ...bp.parcels.map((p) => p.access.point),
    ];
    for (const point of bp.streets.planting) {
      const edge = edgeById.get(point.edgeId);
      expect(edge, point.edgeId).toBeDefined();
      // an alley has no kerb to furnish and a highway no sidewalk
      expect(['street', 'road']).toContain(edge!.class);
      expect(['tree', 'pole', 'bin']).toContain(point.kind);
      expect([PLANTING_SPACING.dense, PLANTING_SPACING.rest]).toContain(point.spacing);
    }
    // the closest any piece of furniture stands to a crossing, a stop, an entrance or a door
    let worst = { gap: Infinity, at: '' };
    for (const point of bp.streets.planting) {
      for (const other of clear) {
        const gap = distance(point.position, other);
        if (gap < worst.gap) worst = { gap, at: `${point.kind} on ${point.edgeId}` };
      }
    }
    expect(worst.gap, worst.at).toBeGreaterThanOrEqual(PLANTING_CLEARANCE);
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

  it('rejects malformed nested parameter payloads with E_INVALID_PARAMS', () => {
    for (const input of [
      { seed: 'bad', districtCount: {} },
      { seed: 'bad', maxFloorsByDistrict: null },
      { seed: 'bad', tierWeights: { unknown: 1 } },
      { seed: 'bad', features: { highways: 'false' } },
    ]) {
      try {
        generateCity(input as never);
        expect.fail('expected malformed input to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(AtlasError);
        expect((error as AtlasError).code).toBe('E_INVALID_PARAMS');
      }
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
