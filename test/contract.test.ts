/**
 * Contract-surface tests: every declared input, output, error and invariant of
 * generateCity once, through the real entry point (CONTRACT.md).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARCHITECTURE_VERSION, AtlasError, BLUEPRINT_VERSION, generateCity } from '../src';
import { bandWidth } from '../src/geom/band';
import { intersection } from '../src/geom/clip';
import { orientedBoundingBox } from '../src/geom/obb';
import { area as polygonArea, bounds, distanceToOutline, pointInPolygon } from '../src/geom/polygon';
import { length as pathLength } from '../src/geom/polyline';
import { closestOnSegment, dist } from '../src/geom/vec';
import { Invariants } from '../src/invariants/Invariants';
import { checkStreetEdges } from '../src/invariants/streetEdges';
import { HIGHWAY_DECK } from '../src/streets/Highways';
import { PLANTING_CLEARANCE, PLANTING_SPACING } from '../src/streets/Planting';
import { resolveStreetDesign } from '../src/streets/construction/Design';
import { StreetReservations } from '../src/streets/layout/reservations/StreetReservations';
import { GENERATION_STAGES, type GenerationProgress } from '../schema/progress';
import type { AtlasParams } from '../schema/params';
import type { ExplicitSidePlanningReservation } from '../src/streets/construction/corridors/schema';
import type { CityBlueprint, HighwayStructure, ParcelType, Vec2 } from '../schema/blueprint';

const PARCEL_TYPES: ParcelType[] = [
  'residential', 'hotel', 'offices', 'corpo', 'hospital', 'clinic', 'police',
  'military', 'factory', 'commerce', 'mall', 'restaurant', 'coffee_shop',
];
const TIERS = ['poor', 'mid', 'rich', 'high_rich'];

/** Shortest floor each type's family builds, mirrored from exterior's floor constants. */
const MIN_FLOOR_HEIGHT: Record<string, number> = {
  residential: 2.6, hotel: 2.8, offices: 3.4, corpo: 3.6, hospital: 3.8, clinic: 3.8,
  police: 3.0, military: 3.0, factory: 4.5, commerce: 3.0, mall: 3.0, restaurant: 3.0, coffee_shop: 3.0,
};

/** Core hosting rectangles, [length, depth] meters, and the band each type keeps end to end (CONTRACT.md). */
const HEAVY_TYPES = new Set<ParcelType>(['offices', 'corpo', 'hotel', 'hospital', 'mall', 'factory']);
const WALKUP = [10.38, 7.58];
const WALKUP_TWO_STAIRS = [16.88, 7.58];
const COMPACT = [12.38, 11.58];
const STANDARD = [19.38, 7.58];
const minBand = (type: ParcelType): number => (HEAVY_TYPES.has(type) ? 11.58 : 7.58);

let cached: CityBlueprint | null = null;
const defaultCity = (): CityBlueprint => (cached ??= generateCity({ seed: 'contract' }));
const fixtureParams = (name: string): AtlasParams =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

describe('blueprint output', () => {
  it('covers every declared collection with valid shapes, hosted cores, references and plain reservations', () => {
    const bp = defaultCity();
    expect(bp.meta.version).toBe(BLUEPRINT_VERSION);
    expect(bp.meta.units).toBe('meters');
    expect(bp.meta.boundary.length).toBeGreaterThanOrEqual(3);

    const [dMin, dMax] = bp.meta.params.districtCount;
    expect(bp.districts.length).toBeGreaterThanOrEqual(dMin);
    expect(bp.districts.length).toBeLessThanOrEqual(dMax);

    expect(bp.streets.nodes.length).toBeGreaterThan(0);
    for (const e of bp.streets.edges.slice(0, 50)) {
      expect(['street', 'road', 'highway', 'alley']).toContain(e.class);
      if (e.class === 'alley') expect(e.width).toBe(0);
      else expect(e.width).toBeGreaterThan(0);
      expect(e.path.length).toBeGreaterThanOrEqual(2);
    }

    expect(bp.parcels.length).toBeGreaterThan(0);
    const districtIds = new Set(bp.districts.map((d) => d.id));
    const blockIds = new Set(bp.blocks.map((b) => b.id));
    const edgeIds = new Set(bp.streets.edges.map((e) => e.id));
    for (const p of bp.parcels) {
      expect([...PARCEL_TYPES, 'park']).toContain(p.type);
      expect(TIERS).toContain(p.tier);
      expect(districtIds.has(p.districtId)).toBe(true);
      expect(blockIds.has(p.blockId)).toBe(true);
      expect(edgeIds.has(p.access.edgeId)).toBe(true);
      if (p.type === 'park') continue;
      expect(p.footprint!.length).toBeGreaterThanOrEqual(3);
      const envelope = p.envelope!;
      expect(envelope.maxHeight).toBeCloseTo(envelope.maxFloors * envelope.floorHeight, 1);
      expect(envelope.minFloors).toBeGreaterThanOrEqual(1);
      expect(envelope.minFloors).toBeLessThanOrEqual(envelope.maxFloors);
      // the envelope admits at least one floor of the type's family
      expect(envelope.maxHeight).toBeGreaterThanOrEqual(MIN_FLOOR_HEIGHT[p.type]);
      // band guarantee: the footprint keeps its type's band end to end
      expect(bandWidth(p.footprint!), `${p.id} ${p.type} band`).toBeGreaterThanOrEqual(minBand(p.type) - 1e-6);
      // core guarantees: the footprint OBB at least spans the rectangle its type and floors need
      const obb = orientedBoundingBox(p.footprint!);
      const spans = (rect: number[]): boolean => obb.length >= Math.max(...rect) - 1e-6 && obb.width >= Math.min(...rect) - 1e-6;
      expect(spans(WALKUP), `${p.id} walkup core`).toBe(true);
      if (HEAVY_TYPES.has(p.type)) expect(spans(COMPACT), `${p.id} ${p.type} compact core`).toBe(true);
      if (envelope.maxFloors > 6) expect(spans(COMPACT) || spans(STANDARD), `${p.id} elevator core`).toBe(true);
      else if (envelope.maxFloors > 4) {
        expect(spans(WALKUP_TWO_STAIRS) || spans(COMPACT) || spans(STANDARD), `${p.id} two-stair core`).toBe(true);
      }
    }

    // ids are globally unique across every collection, with their documented prefixes
    const all = [
      ...bp.districts.map((x) => x.id), ...bp.streets.nodes.map((x) => x.id), ...bp.streets.edges.map((x) => x.id),
      ...(bp.streets.construction?.runs ?? []).map((x) => x.id), ...bp.blocks.map((x) => x.id),
      ...bp.parcels.map((x) => x.id), ...bp.transit.subwayStations.map((x) => x.id), ...bp.transit.subwayLines.map((x) => x.id),
    ];
    expect(new Set(all).size).toBe(all.length);

    expect(bp.volumetric.buildings.length).toBe(bp.parcels.length);
    expect(bp.volumetric.ground.length).toBeGreaterThan(0);
    expect(bp.stats.population).toBeGreaterThan(0);
    expect(bp.stats.perDistrict.length).toBe(bp.districts.length);

    // the default plan stays small: a straight corridor reservation is a plain cap, never a fan
    {
      const bp = defaultCity();
      const bytes = Buffer.byteLength(JSON.stringify(bp));
      const reservations = bp.streets.construction!.planningReservations!;
      // The default 3 x 3 km plan is a browser load and a walk for every consumer.
      expect(bytes).toBeLessThan(10_000_000);
      expect(Buffer.byteLength(JSON.stringify(reservations)) / bytes).toBeLessThan(0.15);

      const edges = new Map(bp.streets.edges.map((edge) => [edge.id, edge]));
      for (const record of reservations.edges) {
        const edge = edges.get(record.edgeId)!;
        if (edge.path.length > 2 || edge.class === 'highway') continue;
        const side = (name: 'left' | 'right') => {
          const reservation = record.sides[name] as ExplicitSidePlanningReservation;
          return [reservation.sidewalk, reservation.walking, reservation.paved ?? [], ...Object.values(reservation.bands ?? {})];
        };
        for (const polygons of [[record.roadway], side('left'), side('right')].flat()) {
          for (const ring of polygons) expect(ring.length, `${record.edgeId} straight reservation ring`).toBeLessThanOrEqual(8);
        }
      }
    }
  });

  it('closes every street on the 2 m grid between its junction boxes', () => {
    const bp = defaultCity();
    const approaches = bp.streets.construction!.junctions!.flatMap((junction) => junction.approaches);
    const declared = new Set(bp.report!.degraded.filter((entry) => entry.kind === 'corridor').map((entry) => entry.id));
    const offGrid: string[] = [];
    for (const edge of bp.streets.edges) {
      if (edge.class === 'highway' || declared.has(edge.id)) continue;
      // the consumer's rule: clear length from one crossing field to the next, in whole 2 m pieces
      const first = edge.path[0], last = edge.path[edge.path.length - 1];
      const length = distance(first, last);
      const direction: Vec2 = [(last[0] - first[0]) / length, (last[1] - first[1]) / length];
      const along = (point: Vec2): number => (point[0] - first[0]) * direction[0] + (point[1] - first[1]) * direction[1];
      const fields = (nodeId: string): number[] => approaches
        .filter((approach) => approach.edgeId === edge.id && approach.nodeId === nodeId)
        .flatMap((approach) => approach.field.map(along));
      const clear = Math.min(length, ...fields(edge.to)) - Math.max(0, ...fields(edge.from));
      if (clear < 0 || Math.abs(clear - Math.round(clear / 2) * 2) > 1e-6) offGrid.push(`${edge.id}:${clear}`);
    }
    expect(offGrid).toEqual([]);
    expect(declared.size).toBe(0);
  });

  it('gives every standard lot two floors and publishes a lot that cannot as a park', () => {
    const bp = defaultCity();
    const parks = bp.parcels.filter((parcel) => parcel.type === 'park');
    expect(bp.parcels.length).toBeGreaterThan(parks.length);
    for (const parcel of bp.parcels) {
      if (parcel.type === 'park') {
        expect(parcel.footprint, `${parcel.id} park footprint`).toBeUndefined();
        expect(parcel.envelope, `${parcel.id} park envelope`).toBeUndefined();
        continue;
      }
      expect(parcel.envelope!.maxFloors, `${parcel.id} floors`).toBeGreaterThanOrEqual(2);
      expect(parcel.envelope!.maxHeight, `${parcel.id} height`).toBeGreaterThanOrEqual(9);
    }
    expect(bp.volumetric.buildings.length).toBe(bp.parcels.length - parks.length);
    expect(bp.stats.parcelCounts.park).toBe(parks.length);
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
      const catalog = [size!.width, size!.depth].sort((a, b) => a - b);
      sides.forEach((side, index) => expect(side, `${p.id} lot`).toBeCloseTo(catalog[index], 6));
      // an exact rectangle, not a bounding box that happens to match
      expect(polygonArea(p.lot), `${p.id} lot area`).toBeCloseTo(size!.area, 6);
    }
  });

  it('publishes every land and ground ring as an axis-aligned rectangle', () => {
    const bp = defaultCity();
    const rectangle = (ring: Vec2[]): boolean =>
      ring.length === 4 && new Set(ring.map((point) => Math.round(point[0] * 1000))).size === 2
        && new Set(ring.map((point) => Math.round(point[1] * 1000))).size === 2;
    const rings: [string, Vec2[][]][] = [
      ['city boundary', [bp.meta.boundary]],
      ['district', bp.districts.map((district) => district.boundary)],
      ['block', bp.blocks.map((block) => block.boundary)],
      ['block paving', bp.blocks.flatMap((block) => [...block.curb, ...block.sidewalk, ...block.openAreas])],
      ['lot', bp.parcels.map((parcel) => parcel.lot)],
      ['footprint', bp.parcels.map((parcel) => parcel.footprint)],
      ['ground', bp.volumetric.ground.map((region) => region.polygon)],
      ['building', bp.volumetric.buildings.map((building) => building.footprint)],
    ];
    for (const [what, list] of rings) {
      expect(list.length).toBeGreaterThan(0);
      expect(list.filter((ring) => !rectangle(ring)).slice(0, 1), `${what} ring`).toEqual([]);
    }
    expect(bp.streets.edges.every((edge) => edge.path.length === 2
      && (edge.path[0][0] === edge.path[1][0] || edge.path[0][1] === edge.path[1][1]))).toBe(true);
  });

  it('tiles equal blocks from one template with identical lots', () => {
    const bp = defaultCity();
    const templates = new Map(bp.meta.blockTemplates!.map((template) => [template.id, template]));
    expect(templates.size).toBeLessThan(bp.blocks.length);
    const tiled = bp.blocks.filter((block) => block.template);
    expect(tiled.length).toBeGreaterThan(bp.blocks.length / 2);
    const lots = new Map(bp.parcels.map((parcel) => [parcel.id, parcel]));
    const shapes = new Map<string, string>();
    for (const block of tiled) {
      const template = templates.get(block.template!)!;
      const min = block.boundary.reduce((low, point) => [Math.min(low[0], point[0]), Math.min(low[1], point[1])] as Vec2);
      // the block is the template's size and zone, and carries exactly its lots
      expect([bounds(block.boundary).max[0] - min[0], bounds(block.boundary).max[1] - min[1]]
        .map((side) => Math.round(side * 1000) / 1000)).toEqual([template.width, template.depth]);
      expect(bp.districts.find((district) => district.id === block.districtId)!.kind).toBe(template.zone);
      const placed = block.parcelIds.map((id) => {
        const box = bounds(lots.get(id)!.lot);
        return { offset: [box.min[0] - min[0], box.min[1] - min[1]].map(round3),
          width: round3(box.max[0] - box.min[0]), depth: round3(box.max[1] - box.min[1]), sizeId: lots.get(id)!.lotSize };
      });
      expect(placed).toEqual(template.lots.map((lot) => ({ ...lot, offset: lot.offset.map(round3) })));
      const key = shapes.get(template.id);
      expect(key ?? JSON.stringify(placed)).toBe(JSON.stringify(placed));
      shapes.set(template.id, JSON.stringify(placed));
    }
  });

  it('gives every subway station a platform, a shaft per entrance and terminal-owned line ends', () => {
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
    const byId = new Map(bp.transit.subwayStations.map((station) => [station.id, station]));
    const served = new Set(bp.transit.subwayLines.flatMap((line) => line.stationIds));
    for (const station of bp.transit.subwayStations) expect(served.has(station.id)).toBe(true);
    for (const line of bp.transit.subwayLines) {
      expect(line.stationIds.length).toBeGreaterThanOrEqual(2);
      const terminals = [byId.get(line.stationIds[0])!, byId.get(line.stationIds.at(-1)!)!];
      [line.path[0], line.path.at(-1)!].forEach((endpoint, index) => {
        const platform = terminals[index].platform;
        expect(pointInPolygon(endpoint, platform) || distanceToOutline(endpoint, platform) <= 1e-6,
          `${line.id} end ${index}`).toBe(true);
      });
    }
  });
});

describe('street furniture', () => {
  it('signals every arm of a signalled junction and plants sparse groups clear of every way in', () => {
    const bp = defaultCity();
    const nodeById = new Map(bp.streets.nodes.map((n) => [n.id, n]));
    const edgeById = new Map(bp.streets.edges.map((e) => [e.id, e]));
    expect(bp.streets.signals.length).toBeGreaterThan(0);
    const armsOf = new Map<string, string[]>();
    for (const signal of bp.streets.signals) {
      const node = nodeById.get(signal.nodeId);
      const edge = edgeById.get(signal.edgeId);
      expect(node, signal.nodeId).toBeDefined();
      expect(node!.edgeIds).toContain(signal.edgeId);
      // a deck overhead and a pedestrian cut are not arms of traffic
      expect(['street', 'road']).toContain(edge!.class);
      expect(Math.hypot(...signal.facing)).toBeCloseTo(1, 9);
      expect(signal.facing[0] * signal.mast.direction[0] + signal.facing[1] * signal.mast.direction[1]).toBeCloseTo(0, 9);
      // the mast reaches from the kerb to the centerline of the arm it stops
      expect(signal.mast.length).toBeGreaterThan(edge!.width / 2);
      armsOf.set(signal.junctionId!, [...(armsOf.get(signal.junctionId!) ?? []), signal.edgeId]);
    }
    for (const [junctionId, arms] of armsOf) {
      const drivable = bp.streets.construction!.junctions!.find((junction) => junction.id === junctionId)!
        .approaches.map((approach) => approach.edgeId);
      expect(arms.sort(), `${junctionId} heads`).toEqual(drivable.sort());
      expect(arms.length).toBeGreaterThanOrEqual(3);
      expect(drivable.some((id) => edgeById.get(id)!.class === 'road'), `${junctionId} carries a road`).toBe(true);
    }

    expect(bp.streets.planting.length).toBeGreaterThan(0);
    const clear: Vec2[] = [
      ...bp.streets.crossings.flatMap((c) => c.segments.flatMap((seg) => [seg.from, seg.to])),
      ...bp.transit.subwayStations.flatMap((s) => s.entrances),
      ...bp.parcels.map((p) => p.access.point),
    ];
    for (const point of bp.streets.planting) {
      const edge = edgeById.get(point.edgeId);
      // an alley has no kerb to furnish and a highway no sidewalk
      expect(['street', 'road']).toContain(edge!.class);
      expect(['tree', 'pole', 'bin']).toContain(point.kind);
      expect([PLANTING_SPACING.dense, PLANTING_SPACING.rest]).toContain(point.spacing);
    }
    const trees = new Map<string, number>();
    for (const point of bp.streets.planting.filter((item) => item.kind === 'tree')) {
      const edge = edgeById.get(point.edgeId)!;
      const [a, b] = edge.path;
      const side = Math.sign((b[0] - a[0]) * (point.position[1] - a[1]) - (b[1] - a[1]) * (point.position[0] - a[0]));
      const key = `${edge.id}:${side}`;
      trees.set(key, (trees.get(key) ?? 0) + 1);
      expect(bp.volumetric.ground.some((region) => region.surface === 'sidewalk' && pointInPolygon(point.position, region.polygon))).toBe(true);
    }
    expect(trees.size).toBeGreaterThan(1);
    expect(trees.size).toBeLessThan(bp.streets.edges.length);
    expect([...trees.values()].every((count) => count <= 2)).toBe(true);
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

describe('architecture', () => {
  it('publishes lanes, turns, crossings, signal phases and ramps over the published streets', () => {
    const bp = defaultCity();
    const plan = bp.architecture!;
    expect(plan.version).toBe(ARCHITECTURE_VERSION);
    expect(plan.edges.map((e) => e.edgeId)).toEqual(bp.streets.edges.map((e) => e.id));
    expect(plan.nodes.map((n) => n.nodeId)).toEqual(bp.streets.nodes.map((n) => n.id));

    const laneIds = new Set<string>();
    for (const record of plan.edges) {
      const edge = bp.streets.edges.find((e) => e.id === record.edgeId)!;
      expect(record.reservation).toEqual({ carriageway: edge.width, left: edge.sidewalk.left, right: edge.sidewalk.right });
      expect(record.lanes.reduce((sum, lane) => sum + lane.width, 0)).toBeLessThanOrEqual(edge.width + 1e-6);
      if (edge.class !== 'alley') expect(record.lanes.length).toBeGreaterThan(0);
      for (const lane of [...record.lanes, ...record.walkingLanes]) {
        expect(laneIds.has(lane.id)).toBe(false);
        laneIds.add(lane.id);
      }
      for (const walk of record.walkingLanes) expect(Math.abs(walk.offset)).toBeGreaterThan(edge.width / 2);
    }

    // a car turns only between lanes that meet at one node inside one elevation group
    const lanes = new Map(plan.edges.flatMap((e) => e.lanes.map((lane) => [lane.id, lane] as const)));
    const levelAt = (edgeId: string, nodeId: string): number => {
      const edge = bp.streets.edges.find((e) => e.id === edgeId)!;
      return edge.to === nodeId ? edge.elevationProfile.at(-1)!.level : edge.elevationProfile[0].level;
    };
    let turns = 0;
    for (const node of plan.nodes) {
      const position = bp.streets.nodes.find((n) => n.id === node.nodeId)!.position;
      for (const turn of node.turns) {
        expect(distance(lanes.get(turn.fromLaneId)!.path.at(-1)!, position)).toBeLessThan(20);
        expect(distance(lanes.get(turn.toLaneId)!.path[0], position)).toBeLessThan(20);
        expect(levelAt(turn.fromLaneId.split('.')[0], node.nodeId)).toBe(turn.level);
        expect(levelAt(turn.toLaneId.split('.')[0], node.nodeId)).toBe(turn.level);
        turns++;
      }
    }
    expect(turns).toBeGreaterThan(0);

    const walking = new Map(plan.edges.flatMap((e) => e.walkingLanes.map((lane) => [lane.id, e.edgeId] as const)));
    const groups = new Map(plan.signalGroups.map((group) => [group.id, group]));
    expect(plan.crossings.length).toBeGreaterThan(0);
    for (const crossing of plan.crossings) {
      for (const end of crossing.ends) expect(walking.get(end.walkingLaneId)).toBe(crossing.edgeId);
      if (crossing.signalGroupId) expect(groups.get(crossing.signalGroupId)!.crossingIds).toContain(crossing.id);
    }
    const highways = new Set(bp.streets.edges.filter((e) => e.class === 'highway').map((e) => e.id));
    expect(plan.ramps.length)
      .toBe(bp.streets.highwayStructures.reduce((n, s) => n + (s.ramps.start > 0 ? 1 : 0) + (s.ramps.end > 0 ? 1 : 0), 0));
    for (const ramp of plan.ramps) {
      expect([ramp.foot, ramp.head]).toEqual([0, 8]);
      expect(ramp.stretches.every((s) => highways.has(s.edgeId))).toBe(true);
      expect(ramp.deckEdgeIds.length).toBeGreaterThan(0);
      expect(bp.streets.nodes.find((n) => n.id === ramp.gradeNodeId)!.edgeIds.some((id) => !highways.has(id))).toBe(true);
    }
  });
});

describe('parameters', () => {
  it('honors feature toggles and resolves the saved trains flag to false', () => {
    const city = generateCity({ seed: 'subway-city', size: { width: 600, depth: 600 }, features: { trains: true } });
    expect(city.meta.params.features.trains).toBe(false);
    expect([city.transit.busRoutes, city.transit.busStops, city.transit.trainLines, city.transit.trainStations])
      .toEqual([[], [], [], []]);
    expect(city.transit.subwayLines.length).toBeGreaterThan(0);
    expect(city.streets.highwayStructures.length).toBeGreaterThan(0);

    const off = generateCity({
      seed: 'toggles', size: { width: 600, depth: 600 },
      features: { highways: false, subways: false, trains: false },
    });
    expect(off.streets.edges.some((e) => e.class === 'highway')).toBe(false);
    expect(off.transit.subwayLines).toHaveLength(0);
    expect(off.transit.subwayStations).toHaveLength(0);
  });

  it('reports every published stage once, in order, with what it produces', () => {
    const seen: GenerationProgress[] = [];
    generateCity({ seed: 'progress', size: { width: 500, depth: 500 } }, (progress) => seen.push(progress));
    expect(seen.map((step) => step.phase)).toEqual(GENERATION_STAGES.map((stage) => stage.phase));
    expect(seen.map((step) => step.completed)).toEqual(GENERATION_STAGES.map((_, index) => index));
    expect(seen.every((step) => step.total === GENERATION_STAGES.length)).toBe(true);
    expect(GENERATION_STAGES.every((stage) => stage.produces.length > 0)).toBe(true);
  });

  it('caps floors globally and per district kind, and allocates every floor at its clear pitch', () => {
    const city = generateCity({
      seed: 'floors', size: { width: 800, depth: 800 }, maxFloors: 6,
      maxFloorsByDistrict: { downtown: 3 }, features: { highways: false, subways: false },
    });
    const downtown = new Set(city.districts.filter((d) => d.kind === 'downtown').map((d) => d.id));
    expect(city.parcels.length).toBeGreaterThan(0);
    for (const parcel of city.parcels) {
      const envelope = parcel.envelope;
      expect(envelope.maxFloors).toBeLessThanOrEqual(downtown.has(parcel.districtId) ? 3 : 6);
      expect(envelope.floorHeight).toBeGreaterThanOrEqual(4.5);
      expect(envelope.maxHeight).toBe(Math.round(envelope.maxFloors * envelope.floorHeight * 100) / 100);
      const height = city.volumetric.buildings.find((building) => building.parcelId === parcel.id)!.height;
      const floors = Math.round(height / envelope.floorHeight);
      expect(floors).toBeGreaterThanOrEqual(envelope.minFloors);
      expect(floors).toBeLessThanOrEqual(envelope.maxFloors);
      expect(height).toBe(Math.round(floors * envelope.floorHeight * 100) / 100);
    }
  });

  it('builds a water city that keeps land clear and stops the perimeter ring at the shoreline', () => {
    const params = { seed: 'hydro-river', size: { width: 900, depth: 900 }, hydrology: { type: 'river' } } as const;
    const city = generateCity(params);
    expect(city.meta.params.hydrology).toEqual({ type: 'river' });
    expect(city.hydrology).toMatchObject({ type: 'river', bodies: [{ type: 'river', materialKey: 'water.river' }] });
    expect(JSON.stringify(generateCity(params))).toBe(JSON.stringify(city));
    const water = city.hydrology!.bodies.flatMap((body) => body.surfaces);
    const overlap = (polygon: Vec2[]): number => intersection([polygon], water).reduce((sum, ring) => sum + polygonArea(ring), 0);
    for (const parcel of city.parcels) expect(overlap(parcel.lot), `${parcel.id} lot`).toBeLessThanOrEqual(0.01);
    for (const ground of city.volumetric.ground) expect(overlap(ground.polygon), `${ground.surface}`).toBeLessThanOrEqual(0.01);
    for (const station of city.transit.subwayStations) expect(overlap(station.platform), station.id).toBeLessThanOrEqual(0.01);

    // dry generation adds no field at all
    const dry = generateCity({ seed: 'no-water', size: { width: 600, depth: 600 } });
    expect('hydrology' in dry).toBe(false);
    expect('hydrology' in dry.meta.params).toBe(false);

    // the sea takes the whole south edge of this coast: that side loses its ring, the dry sides keep theirs
    const coast = generateCity(fixtureParams('coast-city.params.json'));
    const reservations = coast.streets.construction!.reservations!;
    expect({
      regions: coast.volumetric.ground.filter((ground) => ground.moduleBlockId === 'fringe').length,
      frontages: reservations.frontages.filter((frontage) => frontage.ownerId === 'fringe').length,
      corners: reservations.corners.filter((corner) => corner.ownerId === 'fringe').length,
    }).toEqual({ regions: 22, frontages: 3, corners: 2 });
  });

  it('builds district modules with their published medians, finishes and parking dimensions', () => {
    const city = generateCity({ seed: 'district-luxury', size: { width: 500, depth: 500 }, maxFloors: 30,
      tierWeights: { poor: 0, mid: 0, rich: 0.5, high_rich: 0.5 }, features: { highways: false, subways: false } });
    const construction = city.streets.construction!;
    expect(construction.modules!.format).toBe('district');
    expect(construction.medians!.length).toBeGreaterThan(0);
    expect(city.streets.edges.filter((edge) => edge.class !== 'highway').every((edge) => edge.districtStyle !== undefined)).toBe(true);
    for (const owner of construction.reservations!.owners.filter((owner) => owner.kind === 'block')) {
      const block = city.blocks.find((block) => block.id === owner.id)!;
      const district = city.districts.find((district) => district.id === block.districtId)!;
      expect(owner.finish).toBe(district.kind === 'industrial' ? 'industrial-yellow'
        : district.tier === 'high_rich' ? 'luxury-blue' : 'luxury-red');
      expect(construction.reservations!.frontages.filter((front) => front.ownerId === owner.id)
        .every((front) => front.pavedWidth === 4.2 && front.gutterWidth === 0.5)).toBe(true);
    }
    for (const median of construction.medians!) {
      const edge = city.streets.edges.find((edge) => edge.id === median.edgeId)!;
      expect(edge.class).toBe('road');
      expect(edge.crossSection!.lanes).toHaveLength(4);
      expect(edge.crossSection!.median).toEqual({ width: 3.4 });
      expect(edge.width).toBeCloseTo(17.4, 8);
      expect([median.width, median.pavedWidth, median.curbWidth, median.gutterWidth]).toEqual([3.4, 2, 0.2, 0.5]);
    }
    // Every street parks on one kerb, on the 2 m grid street construction closes a run on.
    expect(construction.reservations!.parking.length).toBeGreaterThan(city.blocks.length / 2);
    for (const parking of construction.reservations!.parking) {
      expect([parking.depth, parking.slotLength, parking.endRun, parking.walkingClearance]).toEqual([2, 6, 2, 2.2]);
      expect([parking.start % 2, parking.end % 2, parking.support.start % 2, parking.support.end % 2]).toEqual([0, 0, 0, 0]);
      expect(parking.end - parking.start).toBe(parking.slotCount * 6 + 4);
      expect(parking.slots).toHaveLength(parking.slotCount);
    }
    expect(construction.reservations!.owners.some((owner) => owner.kind === 'perimeter')).toBe(true);
  });

  it('carries every flat highway deck at the published pitch, with grade traffic beneath it', () => {
    const city = generateCity(fixtureParams('highway-support.params.json'));
    expect(city.streets.highwayStructures.length).toBeGreaterThan(0);
    for (const structure of city.streets.highwayStructures) {
      const stations = structure.supports.map((support) => distanceAlong(structure.path, support.position));
      expect(stations.length).toBeGreaterThan(0);
      const flatEnd = pathLength(structure.path) - structure.ramps.end;
      const spans = [...stations, flatEnd].map((station, index) => station - (index ? stations[index - 1]! : structure.ramps.start));
      expect(Math.max(...spans)).toBeLessThanOrEqual(HIGHWAY_DECK.supportPitch + 0.002);
      // two columns never share ground: each stands its own square clear of the last
      const gaps = stations.slice(1).map((station, index) => station - stations[index]!);
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(HIGHWAY_DECK.supportSize);
    }
    // a deck and the street under it stay separate groups at the node they share
    const deck = new Set(city.streets.highwayStructures.flatMap((structure) => structure.edgeIds));
    const crossings = city.streets.nodes.filter((node) => node.connections.some((group) => group.level === 8)
      && node.connections.some((group) => group.level === 0));
    expect(crossings.length).toBeGreaterThan(0);
    for (const node of crossings) {
      expect(node.connections.find((group) => group.level === 8)!.edgeIds.every((id) => deck.has(id))).toBe(true);
      expect(node.connections.find((group) => group.level === 0)!.edgeIds.every((id) => !deck.has(id))).toBe(true);
    }
  });
});

describe('errors', () => {
  it('rejects invalid parameters, unsupported profiles and impossible cities with the declared codes', () => {
    const code = (run: () => unknown): string | undefined => {
      try { run(); return undefined; } catch (error) { return error instanceof AtlasError ? error.code : String(error); }
    };
    for (const input of [
      {}, { seed: 1, size: { width: 0, depth: 400 } }, { seed: 'bad', districtCount: {} }, { seed: 'bad', maxFloorsByDistrict: null },
      { seed: 'bad', tierWeights: { unknown: 1 } }, { seed: 'bad', features: { highways: 'false' } },
      { seed: 'bad-water', hydrology: { type: 'ocean' } },
    ]) {
      expect(code(() => generateCity(input as never)), JSON.stringify(input)).toBe('E_INVALID_PARAMS');
    }
    expect(code(() => generateCity({ seed: 1, size: { width: 400, depth: 400 }, districtCount: [12, 14] }))).toBe('E_UNSATISFIABLE');
    expect(code(() => generateCity({ seed: 'small-water', size: { width: 400, depth: 400 }, hydrology: { type: 'lagoon' } }))).toBe('E_UNSATISFIABLE');

    // construction support checks street profiles before any geometry is built, and changes no input
    const design = resolveStreetDesign();
    design.profiles[0]!.lanes[0]!.width = 3.5;
    const fractional: AtlasParams = { seed: 'fractional-carriageway', streetDesign: design };
    const saved = JSON.stringify(fractional);
    expect(() => generateCity(fractional)).toThrowError(expect.objectContaining({
      code: 'E_INVALID_PARAMS',
      details: { field: 'streetDesign.profiles', profileId: 'one-way', supportedFormat: 'modules' },
    }));
    expect(JSON.stringify(fractional)).toBe(saved);
    expect(() => generateCity({
      seed: 'city-consumer-capability', size: { width: 400, depth: 400 },
      streetDesign: { ...resolveStreetDesign(), sidewalkProfiles: [...resolveStreetDesign().sidewalkProfiles,
        { id: 'legacy', curb: 0.15, border: 0.2, furnishing: 0.5, walking: 2, frontage: 0.15 }],
        sidewalkAssignments: [{ district: 'residential', street: 'compact', road: 'compact' }] },
    })).toThrowError(expect.objectContaining({
      code: 'E_INVALID_PARAMS',
      details: { field: 'streetDesign.sidewalkProfiles', profileId: 'legacy', supportedFormat: 'modules' },
    }));
  });

  it('degrades one element and reports it instead of failing the plan', () => {
    const city = generateCity({ seed: 'hydro-river', size: { width: 500, depth: 500 }, hydrology: { type: 'river' } });
    const degraded = city.report!.degraded;
    expect(degraded.length).toBeGreaterThan(0);
    for (const entry of degraded) {
      expect(['junction-box', 'crossing', 'corridor', 'lot', 'station']).toContain(entry.kind);
      expect(entry.id.length, entry.kind).toBeGreaterThan(0);
      expect(entry.reason.length, entry.id).toBeGreaterThan(0);
    }
    // the plan stands: parcels, streets and the crossings that kept their landings
    expect(city.parcels.length).toBeGreaterThan(0);
    expect(city.streets.crossings.every((crossing) => crossing.segments.length > 0)).toBe(true);
    const lost = degraded.find((entry) => entry.kind === 'crossing')!;
    const [nodeId, edgeId] = lost.id.split(':');
    expect(city.streets.crossings.filter((crossing) => crossing.nodeId === nodeId)
      .flatMap((crossing) => crossing.segments).map((segment) => segment.edgeId)).not.toContain(edgeId);
    // its junction box stays, so the street still closes on the grid
    expect(city.streets.construction!.junctions!.flatMap((junction) => junction.approaches)
      .some((approach) => approach.nodeId === nodeId && approach.edgeId === edgeId)).toBe(true);
  });

  it('rejects an incoherent saved city with E_INVARIANT', () => {
    const invariant = expect.objectContaining({ code: 'E_INVARIANT' });

    const moved = structuredClone(defaultCity());
    moved.transit.subwayLines[0].path[0] = [moved.transit.subwayLines[0].path[0][0] + 200, moved.transit.subwayLines[0].path[0][1] + 200];
    expect(() => Invariants.check(moved)).toThrow(/start leaves terminal platform/);

    const doubled = structuredClone(defaultCity());
    doubled.transit.subwayLines[0].path.push(doubled.transit.subwayLines[0].path.at(-2)!);
    expect(() => Invariants.check(doubled)).toThrow(/doubles back over its own route/);

    const shortPitch = structuredClone(defaultCity());
    shortPitch.parcels.find((parcel) => parcel.envelope.maxFloors > 1)!.envelope.floorHeight = 4.4;
    expect(() => Invariants.check(shortPitch)).toThrow(/floor allocation requires at least 4.5 m pitch/);

    // one physical run, whatever its direction or subdivision; a separate family may repeat it
    const repeated = structuredClone(defaultCity());
    const edge = repeated.streets.edges[0];
    edge.path = [[100, 100], [200, 100]];
    repeated.streets.edges = [edge, { ...edge, id: 'duplicate', from: edge.to, to: edge.from,
      path: [[200, 100], [150, 100], [100, 100]] }];
    expect(() => checkStreetEdges(repeated)).toThrowError(invariant);

    const family = structuredClone(defaultCity());
    const street = family.streets.edges.find((candidate) => candidate.class === 'street')!;
    family.streets.edges.push({ ...street, id: 'semantic-copy', class: 'highway' });
    expect(() => checkStreetEdges(family)).not.toThrow();
    family.streets.edges.at(-1)!.class = 'road';
    expect(() => checkStreetEdges(family)).toThrowError(invariant);
  });
});

/** Where each column stands along its run. */
function distanceAlong(path: HighwayStructure['path'], point: Vec2): number {
  let before = 0;
  let best = { distance: Infinity, along: 0 };
  for (let i = 1; i < path.length; i++) {
    const hit = closestOnSegment(point, path[i - 1]!, path[i]!).point;
    const gap = dist(point, hit);
    if (gap < best.distance) best = { distance: gap, along: before + dist(path[i - 1]!, hit) };
    before += dist(path[i - 1]!, path[i]!);
  }
  return best.along;
}
