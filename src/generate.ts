/** The atlas pipeline: seed + params to a complete CityBlueprint. */
import type {
  Block,
  BusStop,
  CityBlueprint,
  District,
  GroundSurface,
  Parcel,
  Polygon,
  StreetEdge,
  Vec2,
} from '../schema/blueprint';
import type { AtlasParams, DistrictKind } from '../schema/params';
import { Rng } from './core/rng';
import { resolveParams } from './params/defaults';
import { unsatisfiable } from './errors';
import { CityBoundary } from './boundary/CityBoundary';
import { DistrictPlanner } from './districts/DistrictPlanner';
import { DistrictShapes } from './districts/DistrictShapes';
import { StreetGrowth } from './streets/StreetGrowth';
import { StreetGraphBuilder } from './streets/Graph';
import { FaceExtractor } from './streets/Faces';
import { Crossings } from './streets/Crossings';
import { carriagewayWidth, sidewalkWidth } from './streets/widths';
import { BlockBuilder } from './blocks/BlockBuilder';
import { Subdivision, SubdivisionConfig } from './blocks/Subdivision';
import { Zoning, LotInput } from './zoning/Zoning';
import { TransitPlanner } from './transit/TransitPlanner';
import { Invariants } from './invariants/Invariants';
import { bufferLine, difference, offset, snapPoint } from './geom/clip';
import { area, bounds, centroid, pointInPolygon } from './geom/polygon';
import { length as lineLength, pointAt } from './geom/polyline';
import { closestOnSegment, dist, normalize, sub, add, scale } from './geom/vec';

export const BLUEPRINT_VERSION = '0.2.0';

const SUBDIVISION: Record<DistrictKind, SubdivisionConfig> = {
  downtown: { minLotArea: 500, maxLotArea: 2600, chanceNoDivide: 0.12 },
  commercial: { minLotArea: 400, maxLotArea: 3200, chanceNoDivide: 0.12 },
  residential: { minLotArea: 260, maxLotArea: 1300, chanceNoDivide: 0.12 },
  industrial: { minLotArea: 1500, maxLotArea: 9000, chanceNoDivide: 0.2 },
  mixed: { minLotArea: 300, maxLotArea: 1900, chanceNoDivide: 0.12 },
};

const SETBACK: Record<string, number> = {
  residential: 2,
  factory: 3,
  military: 4,
  hospital: 3,
  mall: 2,
  commerce: 0.5,
  restaurant: 0.5,
  coffee_shop: 0.5,
};

export function generateCity(input: AtlasParams): CityBlueprint {
  const params = resolveParams(input);
  const seed = String(params.seed);

  // --- boundary, districts, streets -------------------------------------
  const boundary = CityBoundary.generate(Rng.from(seed, 'boundary'), params.size, params.irregularity);
  const planned = DistrictPlanner.plan(Rng.from(seed, 'districts'), boundary, params);
  const field = StreetGrowth.buildField(Rng.from(seed, 'field'), boundary, params, planned);
  const lines = StreetGrowth.grow(field, boundary, Rng.from(seed, 'streets'), params, planned);
  const graph = StreetGraphBuilder.build(lines, { simplifyTolerance: 1.5, snapRadius: 10 });
  if (graph.edges.length < 8) throw unsatisfiable('street network too small; enlarge size', { edges: graph.edges.length });

  const cityCenter = centroid(boundary);
  const extent = Math.max(params.size.width, params.size.depth) * 3;
  const cells = DistrictShapes.cells(planned, boundary, extent);
  const districtOfPoint = (p: Vec2): number => {
    for (let i = 0; i < cells.length; i++) if (pointInPolygon(p, cells[i])) return i;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < planned.length; i++) {
      const d = dist(planned[i].center, p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  // --- street edges with widths and districts ---------------------------
  const edgeDistrict = new Map<string, number>();
  const streetEdges: StreetEdge[] = graph.edges.map((e) => {
    const mid = pointAt(e.path, lineLength(e.path) / 2);
    const di = districtOfPoint(mid);
    edgeDistrict.set(e.id, di);
    const districtIds = [...new Set([districtOfPoint(e.path[0]), di, districtOfPoint(e.path[e.path.length - 1])])]
      .sort((a, b) => a - b)
      .map((i) => `d${i}`);
    const sw = sidewalkWidth(e.class, planned[di].kind);
    return {
      id: e.id,
      class: e.class,
      from: e.from,
      to: e.to,
      path: e.path,
      width: carriagewayWidth(e.class),
      sidewalk: { left: sw, right: sw },
      districtIds,
    };
  });
  const sidewalkOf = (edgeId: string): number => {
    const e = streetEdgeById.get(edgeId)!;
    return Math.max(e.sidewalk.left, e.sidewalk.right);
  };
  const streetEdgeById = new Map(streetEdges.map((e) => [e.id, e]));

  // --- faces, blocks ----------------------------------------------------
  const faces = FaceExtractor.faces(graph.edges, 400, area(boundary) / 2);
  const edgeBuffers = new Map<string, Polygon[]>();
  for (const e of streetEdges) edgeBuffers.set(e.id, bufferLine(e.path, e.width));
  const builtBlocks = BlockBuilder.build(faces, edgeBuffers, (face) => {
    const di = districtOfPoint(centroid(face.polygon));
    return sidewalkWidth('street', planned[di].kind);
  });

  // --- parcels ----------------------------------------------------------
  const lotRng = Rng.from(seed, 'parcels');
  interface RawLot {
    polygon: Polygon;
    blockIndex: number;
    districtIndex: number;
  }
  const rawLots: RawLot[] = [];
  const blockOpenAreas: Polygon[][] = builtBlocks.map(() => []);
  const blockDistrict: number[] = builtBlocks.map((b) => districtOfPoint(centroid(b.boundary)));
  builtBlocks.forEach((block, blockIndex) => {
    const districtIndex = blockDistrict[blockIndex];
    const cfg = SUBDIVISION[planned[districtIndex].kind];
    const rng = lotRng.fork(blockIndex);
    for (const interior of block.interior) {
      const { lots, openAreas } = Subdivision.subdivide(interior, interior, cfg, rng);
      for (const lot of lots) rawLots.push({ polygon: lot, blockIndex, districtIndex });
      blockOpenAreas[blockIndex].push(...openAreas);
    }
  });
  if (rawLots.length === 0) throw unsatisfiable('no buildable parcels produced; enlarge size');

  const blockHasRoad: boolean[] = builtBlocks.map((b) =>
    b.edgeIds.some((id) => {
      const e = streetEdgeById.get(id);
      return e !== undefined && (e.class === 'road' || e.class === 'highway');
    }),
  );
  const lotInputs: LotInput[] = rawLots.map((l) => ({
    polygon: l.polygon,
    districtIndex: l.districtIndex,
    onRoad: blockHasRoad[l.blockIndex],
  }));
  const zoned = Zoning.assign(lotInputs, planned, cityCenter, Rng.from(seed, 'zoning'));

  const parcels: Parcel[] = zoned.map((z, i) => {
    const raw = rawLots[i];
    const block = builtBlocks[raw.blockIndex];
    const setback = SETBACK[z.type] ?? 1;
    const inset = offset([raw.polygon], -setback).sort((a, b) => area(b) - area(a));
    const footprint = inset[0] ?? raw.polygon;
    // access: nearest street edge of the block, entry point mid-sidewalk
    const lotCenter = centroid(raw.polygon);
    let bestEdge = block.edgeIds[0];
    let bestPoint: Vec2 = lotCenter;
    let bestD = Infinity;
    for (const edgeId of block.edgeIds) {
      const e = streetEdgeById.get(edgeId);
      if (!e) continue;
      for (let s = 0; s < e.path.length - 1; s++) {
        const { point } = closestOnSegment(lotCenter, e.path[s], e.path[s + 1]);
        const d = dist(lotCenter, point);
        if (d < bestD) {
          bestD = d;
          bestEdge = edgeId;
          bestPoint = point;
        }
      }
    }
    const e = streetEdgeById.get(bestEdge)!;
    const toLot = normalize(sub(lotCenter, bestPoint));
    const accessPoint = snapPoint(add(bestPoint, scale(toLot, e.width / 2 + sidewalkOf(bestEdge) / 2)));
    return {
      id: `p${i}`,
      blockId: `b${raw.blockIndex}`,
      districtId: `d${raw.districtIndex}`,
      type: z.type,
      tier: z.tier,
      lot: raw.polygon,
      footprint,
      access: { edgeId: bestEdge, point: accessPoint },
      envelope: z.envelope,
    };
  });

  // --- blocks and districts to schema ------------------------------------
  const blocks: Block[] = builtBlocks.map((b, i) => ({
    id: `b${i}`,
    districtId: `d${blockDistrict[i]}`,
    boundary: b.boundary,
    sidewalk: b.sidewalk,
    parcelIds: parcels.filter((p) => p.blockId === `b${i}`).map((p) => p.id),
    openAreas: blockOpenAreas[i],
  }));

  const districts: District[] = planned.map((d, i) => ({
    id: `d${i}`,
    kind: d.kind,
    tier: d.tier,
    boundary: cells[i],
    center: d.center,
    maxFloors: d.maxFloors,
  }));

  // --- transit -----------------------------------------------------------
  const population = zoned.reduce((s, z) => s + z.residents, 0);
  const planner = new TransitPlanner(graph.nodes, graph.edges, sidewalkOf);
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const anchors = parcels
    .filter((p) => p.type === 'hospital' || p.type === 'mall' || p.type === 'corpo')
    .map((p) => centroid(p.lot));
  const transit = planner.plan({
    districts: planned,
    districtOfNode: (nodeId) => districtOfPoint(nodeById.get(nodeId)!.position),
    cityCenter,
    boundary,
    population,
    anchors,
    features: params.features,
    rng: Rng.from(seed, 'transit'),
  });
  pruneUnusedStops(transit.busStops, transit.busRoutes.flatMap((r) => r.stopIds));

  // --- crossings, ground, volumetric -------------------------------------
  const crossings = Crossings.build(graph.nodes, graph.edges, sidewalkOf);

  // face = its roadway part + block pieces + open pieces, so per-face
  // differences give hole-free roadway ground and exact coverage.
  const ground: GroundSurface[] = [];
  const piecesByFace = new Map<number, Polygon[]>();
  builtBlocks.forEach((b) => {
    (piecesByFace.get(b.faceIndex) ?? piecesByFace.set(b.faceIndex, []).get(b.faceIndex)!).push(b.boundary);
  });
  faces.forEach((face, fi) => {
    for (const poly of difference([face.polygon], piecesByFace.get(fi) ?? [])) {
      ground.push({ surface: 'roadway', polygon: poly });
    }
  });
  for (const b of builtBlocks) for (const poly of b.sidewalk) ground.push({ surface: 'sidewalk', polygon: poly });
  for (const p of parcels) ground.push({ surface: 'block', polygon: p.lot });
  for (const open of blockOpenAreas) for (const poly of open) ground.push({ surface: 'open', polygon: poly });
  const fringe = difference([boundary], faces.map((f) => f.polygon));
  for (const poly of fringe) ground.push({ surface: 'open', polygon: poly });

  const heightRng = Rng.from(seed, 'volumetric');
  const volumetric = {
    buildings: parcels.map((p) => ({
      parcelId: p.id,
      footprint: p.footprint,
      height:
        Math.round(
          heightRng.int(p.envelope.minFloors, p.envelope.maxFloors) * p.envelope.floorHeight * 100,
        ) / 100,
    })),
    ground,
  };

  // --- stats --------------------------------------------------------------
  const emptyCounts = (): Record<string, number> =>
    Object.fromEntries(
      ['residential', 'hotel', 'offices', 'corpo', 'hospital', 'clinic', 'police', 'military', 'factory', 'commerce', 'mall', 'restaurant', 'coffee_shop'].map((t) => [t, 0]),
    );
  const parcelCounts = emptyCounts();
  const perDistrictMap = new Map<string, { population: number; parcelCounts: Record<string, number> }>();
  for (const d of districts) perDistrictMap.set(d.id, { population: 0, parcelCounts: emptyCounts() });
  zoned.forEach((z, i) => {
    const p = parcels[i];
    parcelCounts[p.type] += 1;
    const entry = perDistrictMap.get(p.districtId)!;
    entry.parcelCounts[p.type] += 1;
    entry.population += z.residents;
  });

  const blueprint: CityBlueprint = {
    meta: {
      version: BLUEPRINT_VERSION,
      seed,
      params: params as CityBlueprint['meta']['params'],
      bounds: bounds(boundary),
      units: 'meters',
      boundary,
    },
    districts,
    streets: { nodes: graph.nodes, edges: streetEdges, crossings },
    blocks,
    parcels,
    transit,
    volumetric,
    stats: {
      population,
      parcelCounts: parcelCounts as CityBlueprint['stats']['parcelCounts'],
      perDistrict: districts.map((d) => ({
        districtId: d.id,
        population: perDistrictMap.get(d.id)!.population,
        parcelCounts: perDistrictMap.get(d.id)!.parcelCounts as CityBlueprint['stats']['parcelCounts'],
      })),
    },
  };

  Invariants.check(blueprint);
  return blueprint;
}

function pruneUnusedStops(stops: BusStop[], usedIds: string[]): void {
  const used = new Set(usedIds);
  for (let i = stops.length - 1; i >= 0; i--) {
    if (!used.has(stops[i].id)) stops.splice(i, 1);
  }
}
