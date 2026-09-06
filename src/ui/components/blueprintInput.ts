/** Structural renderer input checks, without generation or geometric certification. */
import type { CityBlueprint } from '../../../schema/blueprint';

type Check = (value: unknown, path: string) => void;
const fail = (path: string): never => { throw new Error(`Invalid blueprint field: ${path}`); };
const number: Check = (v, p) => { if (typeof v !== 'number' || !Number.isFinite(v)) fail(p); };
const positive: Check = (v, p) => { number(v, p); if ((v as number) <= 0) fail(p); };
const count: Check = (v, p) => { positive(v, p); if (!Number.isSafeInteger(v)) fail(p); };
const quarterTurn: Check = (v, p) => { if (![0, 1, 2, 3].includes(v as number)) fail(p); };
const string: Check = (v, p) => { if (typeof v !== 'string' || !v.length) fail(p); };
const choice = (...values: string[]): Check => (v, p) => { if (!values.includes(v as string)) fail(p); };
const optional = (check: Check): Check => (v, p) => { if (v !== undefined) check(v, p); };
const object = (fields: Record<string, Check>): Check => (v, p) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(p);
  for (const [key, check] of Object.entries(fields)) check((v as Record<string, unknown>)[key], `${p}.${key}`);
};
const list = (check: Check, min = 0): Check => (v, p) => {
  if (!Array.isArray(v) || v.length < min) fail(p);
  (v as unknown[]).forEach((item, i) => check(item, `${p}[${i}]`));
};
const vector = (size: number): Check => (v, p) => {
  if (!Array.isArray(v) || v.length !== size) fail(p);
  list(number)(v, p);
};
const point = vector(2);
const path = list(point, 2);
const polygon = list(point, 3);
const polygons = list(polygon);
const strings = list(string);
const elevation = list(object({ distance: number, level: number }), 2);
const tier = choice('poor', 'mid', 'rich', 'high_rich');
const parcelType = choice('residential', 'hotel', 'offices', 'corpo', 'hospital', 'clinic', 'police', 'military', 'factory', 'commerce', 'mall', 'restaurant', 'coffee_shop');
const station = object({
  id: string, position: point, districtId: string, platform: polygon,
  box: object({ bottom: number, top: number }), entrances: list(point), level: number,
  shafts: list(object({ footprint: polygon, top: number, bottom: number, passage: list(point) })),
  accessPaths: list(object({ entranceIndex: number, platformHandoff: vector(3),
    segments: list(object({ kind: choice('stairs', 'passage'), path: list(vector(3), 2) })) })),
});
const rail = object({ id: string, stationIds: strings, path, level: number, width: positive });
const modules = object({
  version: choice('1.0.0'),
  definitions: list(object({ id: string, parts: list(object({
    role: choice('panel', 'joint', 'curb', 'gutter', 'gutter-lip', 'guardrail', 'roadway', 'marking'),
    polygon, bottom: number, top: number,
  }), 1) })),
  placements: list(object({ moduleId: string, blockId: string, origin: point, turn: quarterTurn,
    count, step: positive, finish: string })),
});

const renderInput = object({
  meta: object({ version: string, seed: string, units: choice('meters'), gridAngle: number, boundary: polygon,
    bounds: object({ min: point, max: point }),
    params: object({ seed: (v, p) => { if (typeof v !== 'number') string(v, p); else number(v, p); },
      size: object({ width: positive, depth: positive }) }),
  }),
  districts: list(object({ id: string, kind: string, tier, boundary: polygon, center: point, maxFloors: positive })),
  blocks: list(object({ id: string, districtId: string, boundary: polygon, curb: polygons,
    sidewalk: polygons, openAreas: polygons, parcelIds: strings })),
  parcels: list(object({ id: string, blockId: string, districtId: string, type: parcelType, tier,
    lot: polygon, footprint: polygon, access: object({ edgeId: string, point }),
    envelope: object({ minFloors: number, maxFloors: positive, floorHeight: positive, maxHeight: positive }) })),
  streets: object({
    construction: optional(object({ modules: optional(modules) })),
    nodes: list(object({ id: string, position: point, edgeIds: strings,
      connections: list(object({ level: number, edgeIds: strings })) })),
    edges: list(object({ id: string, class: choice('street', 'road', 'highway', 'alley'), from: string, to: string,
      path, width: number, sidewalk: object({ left: number, right: number }), districtIds: strings,
      level: number, elevationProfile: elevation })),
    crossings: list(object({ nodeId: string, segments: list(object({ edgeId: string, from: point, to: point,
      width: positive, markings: polygons, roadway: optional(object({ from: point, to: point })) })) })),
    signals: list(object({ nodeId: string, edgeId: string, position: point, facing: point,
      mast: object({ direction: point, length: number }) })),
    planting: list(object({ position: point, edgeId: string, kind: string, spacing: number })),
    highwayStructures: list(object({ edgeIds: strings, path, width: positive, level: number, deckThickness: positive,
      ramps: object({ start: number, end: number }), elevationProfile: elevation,
      supports: list(object({ position: point, footprint: polygon, bottom: number, top: number })) })),
  }),
  transit: object({ busStops: list(object({ id: string, edgeId: string, position: point, districtId: string })),
    busRoutes: list(object({ id: string, stopIds: strings, edgeIds: strings })),
    trainStations: list(station), subwayStations: list(station), trainLines: list(rail), subwayLines: list(rail) }),
  volumetric: object({ buildings: list(object({ parcelId: string, footprint: polygon, height: positive })),
    ground: list(object({ surface: choice('roadway', 'curb', 'gutter', 'sidewalk', 'block', 'open'), polygon,
      bottom: number, top: number, moduleBlockId: optional(string) })) }),
  stats: object({ population: number, parcelCounts: object({}), perDistrict: list(object({ districtId: string, population: number, parcelCounts: object({}) })) }),
  hydrology: optional(object({ bodies: list(object({ elevation: number, depth: number,
    materialKey: choice('water.lagoon', 'water.river', 'water.sea-coast'), surfaces: polygons,
    shorelines: list(object({ path: polygon, band: polygons })) })) })),
});

/** Returns the original object, retaining unconsumed fields and exact coordinates. */
export function readBlueprint(value: unknown): CityBlueprint {
  renderInput(value, 'blueprint');
  const blueprint = value as CityBlueprint;
  const { min, max } = blueprint.meta.bounds;
  if (max[0] <= min[0] || max[1] <= min[1]) fail('blueprint.meta.bounds');
  const construction = blueprint.streets.construction?.modules;
  if (construction) {
    const ids = new Set<string>();
    construction.definitions.forEach((definition, index) => {
      const source = `blueprint.streets.construction.modules.definitions[${index}]`;
      if (ids.has(definition.id)) fail(`${source}.id`);
      ids.add(definition.id);
      definition.parts.forEach((part, partIndex) => {
        if (part.top <= part.bottom) fail(`${source}.parts[${partIndex}].top`);
      });
    });
    construction.placements.forEach((placement, index) => {
      if (!ids.has(placement.moduleId)) fail(`blueprint.streets.construction.modules.placements[${index}].moduleId`);
      if (!Number.isFinite(placement.count * placement.step)) fail(`blueprint.streets.construction.modules.placements[${index}].step`);
    });
  }
  return blueprint;
}
