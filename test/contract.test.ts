/**
 * Contract-surface tests: every declared input, output and error of
 * generateCity once, through the real entry point (CONTRACT.md).
 */
import { describe, expect, it } from 'vitest';
import { ARCHITECTURE_VERSION, AtlasError, generateCity } from '../src';
import { bandWidth } from '../src/geom/band';
import { orientedBoundingBox } from '../src/geom/obb';
import { area as polygonArea, pointInPolygon } from '../src/geom/polygon';
import { PLANTING_CLEARANCE, PLANTING_SPACING } from '../src/streets/Planting';
import { GENERATION_STAGES, type GenerationProgress } from '../schema/progress';
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
const COMPACT = [13.14, 13.74];
const STANDARD = [20.14, 9.74];
const minBand = (type: ParcelType): number => (HEAVY_TYPES.has(type) ? 13.14 : 9.74);

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

    expect(bp.transit.busRoutes).toEqual([]);
    expect(bp.transit.busStops).toEqual([]);
    expect(bp.transit.trainLines).toEqual([]);
    expect(bp.transit.trainStations).toEqual([]);
    expect(bp.volumetric.buildings.length).toBe(bp.parcels.length);
    expect(bp.volumetric.ground.length).toBeGreaterThan(0);
    expect(bp.stats.population).toBeGreaterThan(0);
    expect(bp.stats.perDistrict.length).toBe(bp.districts.length);
  });

  it('cuts every ordinary parcel to one published lot size and flags the landmarks', () => {
    const bp = defaultCity();
    const sizes = bp.meta.lotSizes!;
    expect(sizes.length).toBeGreaterThanOrEqual(5);
    expect(new Set(sizes.map((s) => s.id)).size).toBe(sizes.length);
    expect(sizes.every((s) => s.width > 0 && s.depth > 0 && s.area === s.width * s.depth)).toBe(true);

    const byId = new Map(sizes.map((s) => [s.id, s]));
    const landmarks = bp.parcels.filter((p) => p.landmark);
    expect(landmarks.length).toBeGreaterThanOrEqual(10);
    expect(landmarks.length).toBeLessThanOrEqual(30);
    for (const p of landmarks) expect(p.lotSize).toBeUndefined();

    for (const p of bp.parcels) {
      if (p.landmark) continue;
      const size = byId.get(p.lotSize!);
      expect(size, `${p.id} names lot size ${p.lotSize}`).toBeDefined();
      const xs = p.lot.map((v) => v[0]), zs = p.lot.map((v) => v[1]);
      const sides = [Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)].sort((a, b) => a - b);
      expect(sides, `${p.id} lot`).toEqual([size!.width, size!.depth].sort((a, b) => a - b));
      // an exact rectangle, not a bounding box that happens to match
      expect(polygonArea(p.lot), `${p.id} lot area`).toBeCloseTo(size!.area, 6);
    }
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

  it('reports every published stage once, in order, with what it produces', () => {
    const seen: GenerationProgress[] = [];
    generateCity({ seed: 'progress', size: { width: 500, depth: 500 } }, (progress) => seen.push(progress));
    expect(seen.map((step) => step.phase)).toEqual(GENERATION_STAGES.map((stage) => stage.phase));
    expect(seen.map((step) => step.completed)).toEqual(GENERATION_STAGES.map((_, index) => index));
    expect(seen.every((step) => step.total === GENERATION_STAGES.length)).toBe(true);
    expect(GENERATION_STAGES.every((stage) => stage.produces.length > 0)).toBe(true);
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
  }, 15000); // One complete 2 km generation and its invariants.

  it('every parcel access edge exists and every subway station is on a line', () => {
    const bp = defaultCity();
    const edgeIds = new Set(bp.streets.edges.map((e) => e.id));
    for (const p of bp.parcels) expect(edgeIds.has(p.access.edgeId)).toBe(true);
    const onLine = new Set(bp.transit.subwayLines.flatMap((l) => l.stationIds));
    for (const s of bp.transit.subwayStations) expect(onLine.has(s.id)).toBe(true);
    for (const l of bp.transit.subwayLines) {
      expect(l.stationIds.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('gives every subway station a platform and a shaft per entrance', () => {
    const bp = defaultCity();
    expect(bp.transit.subwayStations.length).toBeGreaterThan(0);
    for (const st of bp.transit.subwayStations) {
      expect(st.platform.length, `${st.id} platform`).toBeGreaterThanOrEqual(3);
      expect(pointInPolygon(st.position, st.platform), `${st.id} platform covers its position`).toBe(true);
      expect(st.box.bottom, `${st.id} box floor`).toBe(st.level);
      expect(st.box.top, `${st.id} box ceiling`).toBeGreaterThan(st.box.bottom);
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

  it('places sparse tree groups on sidewalks, clear of every way in', () => {
    const bp = defaultCity();
    expect(bp.streets.planting.length).toBeGreaterThan(0);
    const edgeById = new Map(bp.streets.edges.map((e) => [e.id, e]));
    const clear: Vec2[] = [
      ...bp.streets.crossings.flatMap((c) => c.segments.flatMap((seg) => [seg.from, seg.to])),
      ...bp.transit.subwayStations.flatMap((s) => s.entrances),
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
    const trees = new Map<string, number>();
    for (const point of bp.streets.planting.filter(item => item.kind === 'tree')) {
      const edge = edgeById.get(point.edgeId)!;
      const [a, b] = edge.path;
      const side = Math.sign((b[0] - a[0]) * (point.position[1] - a[1]) - (b[1] - a[1]) * (point.position[0] - a[0]));
      const key = `${edge.id}:${side}`;
      trees.set(key, (trees.get(key) ?? 0) + 1);
      expect(bp.volumetric.ground.some(region => region.surface === 'sidewalk' && pointInPolygon(point.position, region.polygon))).toBe(true);
    }
    expect(trees.size).toBeGreaterThan(1);
    expect(trees.size).toBeLessThan(bp.streets.edges.length);
    expect([...trees.values()].every(count => count <= 2)).toBe(true);
    // the closest any piece of furniture stands to a crossing, an entrance or a door
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

describe('architecture', () => {
  it('publishes lanes, reservations and walking lanes for every street edge', () => {
    const bp = defaultCity();
    const plan = bp.architecture!;
    expect(plan.version).toBe(ARCHITECTURE_VERSION);
    expect(plan.edges.map(e => e.edgeId)).toEqual(bp.streets.edges.map(e => e.id));
    expect(plan.nodes.map(n => n.nodeId)).toEqual(bp.streets.nodes.map(n => n.id));
    const laneIds = new Set<string>();
    for (const record of plan.edges) {
      const edge = bp.streets.edges.find(e => e.id === record.edgeId)!;
      expect(record.reservation).toEqual({ carriageway: edge.width, left: edge.sidewalk.left, right: edge.sidewalk.right });
      const driving = record.lanes.reduce((sum, lane) => sum + lane.width, 0);
      expect(driving).toBeLessThanOrEqual(edge.width + 1e-6);
      if (edge.class !== 'alley') expect(record.lanes.length).toBeGreaterThan(0);
      for (const lane of [...record.lanes, ...record.walkingLanes]) {
        expect(laneIds.has(lane.id)).toBe(false);
        laneIds.add(lane.id);
      }
      for (const walk of record.walkingLanes) expect(Math.abs(walk.offset)).toBeGreaterThan(edge.width / 2);
    }
  });

  it('lets a car turn only between lanes that meet at one node and one level', () => {
    const bp = defaultCity();
    const plan = bp.architecture!;
    const lanes = new Map(plan.edges.flatMap(e => e.lanes.map(lane => [lane.id, lane] as const)));
    const levelAt = (edgeId: string, nodeId: string): number => {
      const edge = bp.streets.edges.find(e => e.id === edgeId)!;
      const knots = edge.elevationProfile;
      return edge.to === nodeId ? knots.at(-1)!.level : knots[0].level;
    };
    let turns = 0;
    for (const node of plan.nodes) {
      const position = bp.streets.nodes.find(n => n.id === node.nodeId)!.position;
      for (const turn of node.turns) {
        const from = lanes.get(turn.fromLaneId)!, to = lanes.get(turn.toLaneId)!;
        expect(distance(from.path.at(-1)!, position)).toBeLessThan(20);
        expect(distance(to.path[0], position)).toBeLessThan(20);
        const fromEdge = turn.fromLaneId.split('.')[0], toEdge = turn.toLaneId.split('.')[0];
        expect(levelAt(fromEdge, node.nodeId)).toBe(turn.level);
        expect(levelAt(toEdge, node.nodeId)).toBe(turn.level);
        turns++;
      }
    }
    expect(turns).toBeGreaterThan(0);
  });

  it('joins each crossing to walking lanes of its own arm, releases it with a phase and ramps a car to the deck', () => {
    const bp = defaultCity();
    const plan = bp.architecture!;
    const walking = new Map(plan.edges.flatMap(e => e.walkingLanes.map(lane => [lane.id, e.edgeId] as const)));
    const groups = new Map(plan.signalGroups.map(group => [group.id, group]));
    expect(plan.crossings.length).toBeGreaterThan(0);
    for (const crossing of plan.crossings) {
      for (const end of crossing.ends) expect(walking.get(end.walkingLaneId)).toBe(crossing.edgeId);
      if (crossing.signalGroupId) expect(groups.get(crossing.signalGroupId)!.crossingIds).toContain(crossing.id);
    }
    const highways = new Set(bp.streets.edges.filter(e => e.class === 'highway').map(e => e.id));
    expect(plan.ramps.length).toBe(bp.streets.highwayStructures.reduce((n, s) => n + (s.ramps.start > 0 ? 1 : 0) + (s.ramps.end > 0 ? 1 : 0), 0));
    for (const ramp of plan.ramps) {
      expect(ramp.foot).toBe(0);
      expect(ramp.head).toBe(8);
      expect(ramp.stretches.every(s => highways.has(s.edgeId))).toBe(true);
      expect(ramp.deckEdgeIds.length).toBeGreaterThan(0);
      expect(bp.streets.nodes.find(n => n.id === ramp.gradeNodeId)!.edgeIds.some(id => !highways.has(id))).toBe(true);
    }
  });
});
