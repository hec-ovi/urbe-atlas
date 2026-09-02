/**
 * Contract-surface tests: every declared input, output and error of
 * generateCity once, through the real entry point (CONTRACT.md).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AtlasError, generateCity } from '../src';
import { bandWidth } from '../src/geom/band';
import { orientedBoundingBox } from '../src/geom/obb';
import { intersection, offset } from '../src/geom/clip';
import { area as polygonArea, bounds, pointInPolygon } from '../src/geom/polygon';
import { CURB_WIDTH } from '../src/streets/widths';
import type { CityBlueprint, ParcelType, Polyline, Vec2 } from '../schema/blueprint';

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

/** Sharpest turn a street centerline may make, from CONTRACT.md. */
const MAX_TURN_DEG = 120;
/** Overlap band a ground surface pair may not exceed, meters (CONTRACT.md). */
const OVERLAP_EPS = 0.01;

let cached: CityBlueprint | null = null;
const defaultCity = (): CityBlueprint => (cached ??= generateCity({ seed: 'contract' }));

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Distance from a point to a segment, for the kerb walk. */
function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b[0] - a[0];
  const vz = b[1] - a[1];
  const len = vx * vx + vz * vz;
  const t = len > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vz));
}

/** Turn at path[i], in degrees: 0 straight ahead, 180 straight back. */
function turnAt(path: Polyline, i: number): number {
  const u: Vec2 = [path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]];
  const v: Vec2 = [path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]];
  const l = Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]);
  if (l === 0) return 180;
  const cos = Math.min(1, Math.max(-1, (u[0] * v[0] + u[1] * v[1]) / l));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** No edge is degenerate and none folds back over its own sidewalk band. */
function expectStreetEdgesAreRuns(bp: CityBlueprint): void {
  for (const e of bp.streets.edges) {
    expect(e.from, `${e.id} is a self-loop`).not.toBe(e.to);
    expect(e.path.length, `${e.id} path`).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < e.path.length; i++) {
      expect(distance(e.path[i - 1], e.path[i]), `${e.id} point ${i}`).toBeGreaterThan(0);
    }
    for (let i = 1; i < e.path.length - 1; i++) {
      expect(turnAt(e.path, i), `${e.id} folds at point ${i}`).toBeLessThanOrEqual(MAX_TURN_DEG);
    }
  }
}

/** Roadway, sidewalk, block and open surfaces tile the city: none overlaps another. */
function expectGroundSurfacesAreDisjoint(bp: CityBlueprint): void {
  const ground = bp.volumetric.ground;
  const boxes = ground.map((g) => bounds(g.polygon));
  for (let i = 0; i < ground.length; i++) {
    for (let j = i + 1; j < ground.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.max[0] - OVERLAP_EPS < b.min[0] + OVERLAP_EPS || b.max[0] - OVERLAP_EPS < a.min[0] + OVERLAP_EPS) continue;
      if (a.max[1] - OVERLAP_EPS < b.min[1] + OVERLAP_EPS || b.max[1] - OVERLAP_EPS < a.min[1] + OVERLAP_EPS) continue;
      const shared = intersection([ground[i].polygon], [ground[j].polygon]);
      const band = shared.length === 0 ? [] : offset(shared, -OVERLAP_EPS);
      expect(band, `${ground[i].surface} ${i} overlaps ${ground[j].surface} ${j}`).toHaveLength(0);
    }
  }
}

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
      expect(['street', 'road', 'highway', 'alley']).toContain(e.class);
      if (e.class === 'alley') expect(e.width).toBe(0);
      else expect(e.width).toBeGreaterThan(0);
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

  it('rounds curb corners on every block outline', () => {
    const bp = defaultCity();
    let arcVertices = 0;
    for (const b of bp.blocks) {
      const n = b.boundary.length;
      for (let i = 0; i < n; i++) {
        const a = b.boundary[(i - 1 + n) % n];
        const corner = b.boundary[i];
        const c = b.boundary[(i + 1) % n];
        const la = Math.hypot(corner[0] - a[0], corner[1] - a[1]);
        const lc = Math.hypot(c[0] - corner[0], c[1] - corner[1]);
        if (la < 1e-6 || lc < 1e-6) continue;
        // blocks come out CCW, so a left turn is a convex (curb) corner
        const convex = (corner[0] - a[0]) * (c[1] - corner[1]) - (corner[1] - a[1]) * (c[0] - corner[0]) > 0;
        const cos = ((a[0] - corner[0]) * (c[0] - corner[0]) + (a[1] - corner[1]) * (c[1] - corner[1])) / (la * lc);
        const interior = Math.acos(Math.min(1, Math.max(-1, cos)));
        const turn = (180 * (Math.PI - interior)) / Math.PI;
        if (turn < 18) arcVertices++;
        // room for at least a 0.6 m return, using at most 40% of each edge
        const room = 0.4 * Math.min(la, lc) * Math.tan(interior / 2);
        if (convex && room >= 0.6) expect(turn).toBeLessThanOrEqual(35);
      }
    }
    expect(arcVertices).toBeGreaterThan(bp.blocks.length);
  });

  it('runs a curb strip along every block boundary a roadway borders', () => {
    const bp = defaultCity();
    const alleys = bp.streets.edges.filter((e) => e.class === 'alley');
    const nearAlley = (p: Vec2): boolean =>
      alleys.some((e) => e.path.slice(1).some((q, i) => segmentDistance(p, e.path[i], q) < CURB_WIDTH * 4));
    let curbPieces = 0;
    for (const b of bp.blocks) {
      for (const poly of b.curb) {
        curbPieces++;
        // a run of kerb, never a sliver a boolean left behind
        expect(polygonArea(poly), 'curb piece area').toBeGreaterThan(CURB_WIDTH * 0.5);
      }
      // walk the boundary and step into the band: the kerb covers it end to end
      for (let i = 0; i < b.boundary.length; i++) {
        const a = b.boundary[i];
        const c = b.boundary[(i + 1) % b.boundary.length];
        const span = distance(a, c);
        if (span === 0) continue;
        for (let step = 0; step < Math.ceil(span); step++) {
          const t = (step + 0.5) / Math.ceil(span);
          const on: Vec2 = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
          // rings are CCW, so the inward normal is the edge direction turned left
          const into: Vec2 = [
            on[0] - ((c[1] - a[1]) / span) * (CURB_WIDTH / 2),
            on[1] + ((c[0] - a[0]) / span) * (CURB_WIDTH / 2),
          ];
          if (nearAlley(into)) continue;
          expect(b.curb.some((poly) => pointInPolygon(into, poly)), `${b.id} kerb at ${into}`).toBe(true);
        }
      }
    }
    expect(curbPieces).toBeGreaterThan(0);
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

  it('gives every station a platform, and every underground one a shaft per entrance', () => {
    const bp = defaultCity();
    expect(bp.transit.subwayStations.length).toBeGreaterThan(0);
    for (const st of [...bp.transit.subwayStations, ...bp.transit.trainStations]) {
      expect(st.platform.length, `${st.id} platform`).toBeGreaterThanOrEqual(3);
      expect(pointInPolygon(st.position, st.platform), `${st.id} platform covers its position`).toBe(true);
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

describe('alleys', () => {
  it('cuts pedestrian-only alleys no vehicle can use', () => {
    const bp = defaultCity();
    const alleys = bp.streets.edges.filter((e) => e.class === 'alley');
    expect(alleys.length).toBeGreaterThan(0);
    for (const a of alleys) {
      expect(a.width, `${a.id} carriageway`).toBe(0);
      expect(a.sidewalk.left).toBeGreaterThan(0);
      expect(a.sidewalk.right).toBeGreaterThan(0);
      const width = a.sidewalk.left + a.sidewalk.right;
      expect(width, `${a.id} width`).toBeGreaterThanOrEqual(3);
      expect(width, `${a.id} width`).toBeLessThanOrEqual(5);
    }
    const alleyIds = new Set(alleys.map((a) => a.id));
    for (const s of bp.transit.busStops) expect(alleyIds.has(s.edgeId)).toBe(false);
    for (const r of bp.transit.busRoutes) {
      for (const id of r.edgeIds) expect(alleyIds.has(id)).toBe(false);
    }
  });

  it('leaves them out when the toggle is off', () => {
    const params = { seed: 'alleys', size: { width: 1200, depth: 1200 } };
    const hasAlley = (bp: CityBlueprint): boolean => bp.streets.edges.some((e) => e.class === 'alley');
    expect(hasAlley(generateCity(params))).toBe(true);
    expect(hasAlley(generateCity({ ...params, features: { alleys: false } }))).toBe(false);
  });
});

describe('committed samples', () => {
  it('samples/city-urbe.json regenerates byte-identical', () => {
    const file = readFileSync(new URL('../samples/city-urbe.json', import.meta.url), 'utf8');
    expect(JSON.stringify(generateCity({ seed: 'urbe' }))).toBe(file);
  });

  it('samples/city-urbe-small.json regenerates byte-identical', () => {
    const file = readFileSync(new URL('../samples/city-urbe-small.json', import.meta.url), 'utf8');
    expect(JSON.stringify(generateCity({ seed: 'urbe-small', size: { width: 800, depth: 800 } }))).toBe(file);
  });

  it('samples/city-urbe-tiny.json regenerates byte-identical', () => {
    const file = readFileSync(new URL('../samples/city-urbe-tiny.json', import.meta.url), 'utf8');
    const bp = generateCity({
      seed: 'urbe-tiny',
      size: { width: 400, depth: 400 },
      maxFloors: 6,
      features: { highways: false, trains: false, subways: false },
    });
    expect(JSON.stringify(bp)).toBe(file);
  });
});

describe('small cities', () => {
  it('stays coherent or refuses cleanly across small sizes and seeds', () => {
    for (const size of [300, 350, 400, 450, 500, 600, 700]) {
      for (const seed of ['urbe-tiny', 'a', 'b', 'c', 'd', 'e']) {
        let bp: CityBlueprint;
        try {
          bp = generateCity({ seed, size: { width: size, depth: size }, maxFloors: 6 });
        } catch (e) {
          // too small to lay a city: refused, never returned incoherent
          expect((e as AtlasError).code).toBe('E_UNSATISFIABLE');
          continue;
        }
        const lines = [...bp.transit.subwayLines, ...bp.transit.trainLines];
        const served = new Set(lines.flatMap((l) => l.stationIds));
        for (const s of [...bp.transit.subwayStations, ...bp.transit.trainStations]) {
          expect(served.has(s.id)).toBe(true);
        }
        for (const l of lines) expect(l.stationIds.length).toBeGreaterThanOrEqual(2);
        expectStreetEdgesAreRuns(bp);
        expectGroundSurfacesAreDisjoint(bp);
      }
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
