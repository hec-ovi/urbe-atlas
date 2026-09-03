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
import { AlleyPlanner } from './streets/AlleyPlanner';
import { StreetGraphBuilder } from './streets/Graph';
import { applyHighwayElevationProfiles, ensureUsableHighway, HIGHWAY_DECK, highwayStructures } from './streets/Highways';
import { streetNodesWithConnections } from './streets/Connections';
import { FaceExtractor } from './streets/Faces';
import type { Face } from './streets/Faces';
import { Crossings } from './streets/Crossings';
import { Signals } from './streets/Signals';
import { Obstacles, Planting } from './streets/Planting';
import { CURB_WIDTH, carriagewayWidth, sidewalkWidth } from './streets/widths';
import { BlockBuilder, BuiltBlock } from './blocks/BlockBuilder';
import { Buildability } from './blocks/Buildability';
import { Subdivision, SubdivisionConfig } from './blocks/Subdivision';
import { Zoning, LotInput } from './zoning/Zoning';
import { hostingProfiles } from './zoning/profiles';
import { TransitPlanner } from './transit/TransitPlanner';
import { Invariants } from './invariants/Invariants';
import { bufferLine, difference, intersection, offset, snapPoint, union } from './geom/clip';
import { area, bounds, centroid, pointInPolygon } from './geom/polygon';
import { directionAt, length as lineLength, pointAt } from './geom/polyline';
import { closestOnSegment, cross, dist, sub } from './geom/vec';
import { LEVELS } from './levels';
import { cityGridAngle } from './grid';
import { RAIL, STATION } from './transit/stations';
import { GROUND_LEVELS, type GroundSurfaceKind } from './streets/surfaces';

export const BLUEPRINT_VERSION = '0.14.0';

const SUBDIVISION: Record<DistrictKind, SubdivisionConfig> = {
  downtown: { minLotArea: 500, maxLotArea: 2600, chanceNoDivide: 0.12 },
  commercial: { minLotArea: 400, maxLotArea: 3200, chanceNoDivide: 0.12 },
  residential: { minLotArea: 260, maxLotArea: 1300, chanceNoDivide: 0.12 },
  industrial: { minLotArea: 1500, maxLotArea: 9000, chanceNoDivide: 0.2 },
  mixed: { minLotArea: 300, maxLotArea: 1900, chanceNoDivide: 0.12 },
};

export function generateCity(input: AtlasParams): CityBlueprint {
  const params = resolveParams(input);
  const seed = String(params.seed);

  // --- boundary, districts, streets -------------------------------------
  const boundary = CityBoundary.generate(Rng.from(seed, 'boundary'), params.size, params.irregularity);
  const planned = DistrictPlanner.plan(Rng.from(seed, 'districts'), boundary, params);
  const gridAngle = cityGridAngle(Rng.from(seed, 'grid'));
  const field = StreetGrowth.buildField(boundary, params, planned, gridAngle);
  let lines = StreetGrowth.grow(field, boundary, Rng.from(seed, 'streets'), params, planned);

  const cityCenter = centroid(boundary);
  const extent = Math.max(params.size.width, params.size.depth) * 3;
  const cells = DistrictShapes.cells(planned, boundary, extent, gridAngle, params.irregularity, Rng.from(seed, 'district-shapes'));
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

  // --- street graph, then the alleys cut into its long blocks ------------
  // An alley crosses the buildable land of a block, so the graph is built
  // twice: once to read those blocks, once with the alleys inside it, which
  // makes them nodes and edges of the same planar network.
  const buildGraph = (traced: typeof lines): ReturnType<typeof StreetGraphBuilder.build> =>
    StreetGraphBuilder.build(traced, { simplifyTolerance: 1.5, snapRadius: 10 });
  const facesOf = (edges: ReturnType<typeof buildGraph>['edges']): Face[] =>
    FaceExtractor.faces(edges, 400, area(boundary) / 2);
  const roadwayOf = (edges: ReturnType<typeof buildGraph>['edges']): Map<string, Polygon[]> => {
    const buffers = new Map<string, Polygon[]>();
    for (const e of edges) {
      const width = carriagewayWidth(e.class);
      if (width > 0) buffers.set(e.id, bufferLine(e.path, width));
    }
    return buffers;
  };

  let graph = buildGraph(lines);
  if (graph.edges.length < 8) throw unsatisfiable('street network too small; enlarge size', { edges: graph.edges.length });
  let faces = facesOf(graph.edges);
  // Two faces sharing ground means the tracer left a crossing the graph could not resolve;
  // the streets are grown again from the next seed in line, a few times, then the city refuses.
  for (let attempt = 1; !facesPlanar(faces) && attempt <= PLANAR_ATTEMPTS; attempt++) {
    lines = StreetGrowth.grow(field, boundary, Rng.from(seed, `streets:${attempt}`), params, planned);
    graph = buildGraph(lines);
    faces = graph.edges.length < 8 ? [] : facesOf(graph.edges);
  }
  if (graph.edges.length < 8 || !facesPlanar(faces)) {
    throw unsatisfiable('street network never planar for this seed and size; change either', { edges: graph.edges.length });
  }
  if (params.features.alleys) {
    const land = BlockBuilder.pieces(faces, roadwayOf(graph.edges));
    const alleys = AlleyPlanner.plan(
      land.map((piece) => piece.polygon),
      graph.nodes.map((n) => n.position),
      (p) => planned[districtOfPoint(p)],
      Rng.from(seed, 'alleys'),
    );
    if (alleys.length > 0) {
      const withAlleys = buildGraph([...lines, ...alleys.map((path) => ({ path, class: 'alley' as const }))]);
      const alleyFaces = facesOf(withAlleys.edges);
      // an alley that leaves two faces sharing ground is not worth the block it cuts
      if (facesPlanar(alleyFaces)) {
        graph = withAlleys;
        faces = alleyFaces;
      }
    }
  }

  // Keep a complete, supportable through route. A tracer fragment becomes a
  // road; when none survives, a city-edge route through the planar graph is
  // promoted before widths, blocks and parcels are derived.
  if (params.features.highways) ensureUsableHighway(graph.edges, graph.nodes, boundary);

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
      level: e.class === 'highway' ? LEVELS.highway : LEVELS.ground,
      elevationProfile: [],
    };
  });
  applyHighwayElevationProfiles(streetEdges);
  const sidewalkOf = (edgeId: string): number => {
    const e = streetEdgeById.get(edgeId)!;
    return Math.max(e.sidewalk.left, e.sidewalk.right);
  };
  const streetEdgeById = new Map(streetEdges.map((e) => [e.id, e]));
  // Curved joins can extend the deck into a face beyond its centerline
  // offset, so construction clearance is reserved from the exact buffered
  // run. A wider exclusion keeps an entire train platform away from a deck,
  // regardless of the platform's eventual orientation.
  const highwayNoBuild = union(
    streetEdges
      .filter((edge) => edge.class === 'highway')
      .flatMap((edge) => bufferLine(edge.path, edge.width + HIGHWAY_DECK.buildingClearance * 2)),
  );
  const trainStationExclusion = union(
    streetEdges
      .filter((edge) => edge.class === 'highway')
      .flatMap((edge) => bufferLine(
        edge.path,
        edge.width
          + Math.hypot(STATION.train.platformLength, STATION.train.platformWidth)
          + RAIL.buildingClearance * 2,
      )),
  );
  // Transit runs on the driveable graph. The train is planned now because its
  // grade-level right-of-way must be removed before parcels are subdivided.
  const vehicleEdges = streetEdges.filter((edge) => edge.class !== 'alley');
  const vehicleEdgeIds = new Set(vehicleEdges.map((edge) => edge.id));
  const vehicleNodes = graph.nodes.filter((node) => node.edgeIds.some((id) => vehicleEdgeIds.has(id)));
  const planner = new TransitPlanner(vehicleNodes, vehicleEdges, sidewalkOf);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const transitRng = Rng.from(seed, 'transit');
  const trainPlan = params.features.trains
    ? planner.planTrain({
        districtOfNode: (nodeId) => districtOfPoint(nodeById.get(nodeId)!.position),
        cityCenter,
        boundary,
        stationExclusion: trainStationExclusion,
        rng: transitRng,
      })
    : undefined;

  // --- blocks -----------------------------------------------------------
  // An alley has no carriageway to carve out: the sidewalk rings of the two
  // blocks it separates meet at its centerline and are the whole alley, so
  // those blocks keep their rings narrow enough to stay within ALLEY_WIDTH.
  const alleyEdgeIds = new Set(streetEdges.filter((e) => e.class === 'alley').map((e) => e.id));
  // the kerb stops where an alley reaches a block: a band across its centerline
  // takes back what the two flanking rings would otherwise pave as kerb
  const alleyBuffers = new Map<string, Polygon[]>();
  for (const e of graph.edges) {
    if (alleyEdgeIds.has(e.id)) alleyBuffers.set(e.id, bufferLine(e.path, CURB_WIDTH * 4));
  }
  const builtBlocks = BlockBuilder.build(
    faces,
    roadwayOf(graph.edges),
    alleyBuffers,
    (face: Face) => {
      const di = districtOfPoint(centroid(face.polygon));
      const cls = face.edgeIds.some((id: string) => alleyEdgeIds.has(id)) ? 'alley' : 'street';
      return sidewalkWidth(cls, planned[di].kind);
    },
    Rng.from(seed, 'curbs'),
  );
  for (const e of streetEdges) {
    if (e.class === 'alley') adoptFlankingSidewalks(e, builtBlocks);
  }

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
  const sidewalkedEdges: string[][] = builtBlocks.map((b) =>
    b.edgeIds.filter((id) => {
      const e = streetEdgeById.get(id);
      return e !== undefined && (e.sidewalk.left > 0 || e.sidewalk.right > 0);
    }),
  );
  const trainNoBuild = trainPlan
    ? union([
        ...trainPlan.trainLines.flatMap((line) =>
          bufferLine(line.path, line.width + RAIL.buildingClearance * 2)),
        ...trainPlan.trainStations.flatMap((station) =>
          offset([station.platform], RAIL.buildingClearance)),
      ])
    : [];
  const infrastructureNoBuild = union([...highwayNoBuild, ...trainNoBuild]);
  builtBlocks.forEach((block, blockIndex) => {
    const districtIndex = blockDistrict[blockIndex];
    const cfg = SUBDIVISION[planned[districtIndex].kind];
    const rng = lotRng.fork(blockIndex);
    const reserved = intersection(block.interior, infrastructureNoBuild);
    blockOpenAreas[blockIndex].push(...reserved);
    for (const interior of difference(block.interior, infrastructureNoBuild)) {
      // a block reachable only via highways gets no parcels: open ground instead
      if (sidewalkedEdges[blockIndex].length === 0) {
        blockOpenAreas[blockIndex].push(interior);
        continue;
      }
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

  // buildability: the footprint hosts its type's band and core, else the
  // district's light type's, else the lot is no parcel
  const buildable = Buildability.enforce(
    rawLots.map((l, i) => ({
      polygon: l.polygon,
      blockIndex: l.blockIndex,
      profiles: hostingProfiles(zoned[i].type, Zoning.fallbackType(planned[l.districtIndex].kind)),
    })),
  );
  for (const [blockIndex, polygons] of buildable.openAreas) blockOpenAreas[blockIndex].push(...polygons);
  if (buildable.lots.length === 0) throw unsatisfiable('no buildable parcels produced; enlarge size');
  const retypeRng = Rng.from(seed, 'retype');
  const zonedParcels = buildable.lots.map((l) =>
    l.profile === 0 ? zoned[l.index] : Zoning.retype(zoned[l.index], planned[rawLots[l.index].districtIndex], retypeRng.fork(l.index)),
  );

  const parcels: Parcel[] = buildable.lots.map((lot, i) => {
    const z = zonedParcels[i];
    const raw = rawLots[lot.index];
    const block = builtBlocks[raw.blockIndex];
    const footprint = lot.footprint;
    // floors stay within what the hosted core allows
    let envelope = z.envelope;
    if (envelope.maxFloors > lot.floorCap) {
      const maxFloors = lot.floorCap;
      envelope = {
        minFloors: Math.min(envelope.minFloors, maxFloors),
        maxFloors,
        floorHeight: envelope.floorHeight,
        maxHeight: Math.round(maxFloors * envelope.floorHeight * 100) / 100,
      };
    }
    // capacity follows the final lot, which a merge may have grown
    if (z.type === 'residential') z.residents = Zoning.residentsFor(area(lot.polygon), envelope);
    // access: the block sidewalk point nearest the lot, then the edge serving it
    const accessPoint = snapPoint(closestSidewalkPoint(lot.polygon, block.sidewalk));
    let bestEdge = sidewalkedEdges[raw.blockIndex][0];
    let bestD = Infinity;
    for (const edgeId of sidewalkedEdges[raw.blockIndex]) {
      const e = streetEdgeById.get(edgeId)!;
      for (let s = 0; s < e.path.length - 1; s++) {
        const { point } = closestOnSegment(accessPoint, e.path[s], e.path[s + 1]);
        const d = dist(accessPoint, point);
        if (d < bestD) {
          bestD = d;
          bestEdge = edgeId;
        }
      }
    }
    return {
      id: `p${i}`,
      blockId: `b${raw.blockIndex}`,
      districtId: `d${raw.districtIndex}`,
      type: z.type,
      tier: z.tier,
      lot: lot.polygon,
      footprint,
      access: { edgeId: bestEdge, point: accessPoint },
      envelope,
    };
  });

  // --- blocks and districts to schema ------------------------------------
  const blocks: Block[] = builtBlocks.map((b, i) => ({
    id: `b${i}`,
    districtId: `d${blockDistrict[i]}`,
    boundary: b.boundary,
    curb: b.curb,
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
  const population = zonedParcels.reduce((s, z) => s + z.residents, 0);
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
    trainPlan,
    entranceObstacles: parcels.map((parcel) => parcel.footprint),
    rng: transitRng,
  });
  pruneUnusedStops(transit.busStops, transit.busRoutes.flatMap((r) => r.stopIds));

  // --- crossings, ground, volumetric -------------------------------------
  const crossings = Crossings.build(graph.nodes, graph.edges, sidewalkOf);
  const streetNodes = streetNodesWithConnections(graph.nodes, streetEdges);
  const signals = Signals.build(streetNodes, streetEdges);

  // street furniture keeps clear of everything a person already uses on the sidewalk
  const obstacles = new Obstacles();
  obstacles.add(crossings.flatMap((c) => c.segments.flatMap((s) => [s.from, s.to])));
  obstacles.add(signals.map((s) => s.position));
  obstacles.add(transit.busStops.map((s) => s.position));
  obstacles.add([...transit.trainStations, ...transit.subwayStations].flatMap((s) => s.entrances));
  obstacles.add(parcels.map((p) => p.access.point));
  const planting = Planting.build(
    streetEdges,
    (edgeId) => planned[edgeDistrict.get(edgeId) ?? 0].kind,
    obstacles,
    Rng.from(seed, 'planting'),
  );
  const subwayShafts = transit.subwayStations.flatMap((station) => station.shafts.map((shaft) => shaft.footprint));
  const pedestrianPaving = builtBlocks.flatMap((block) => [...block.curb, ...block.sidewalk]);
  const structures = highwayStructures(streetEdges, [...trainNoBuild, ...subwayShafts, ...pedestrianPaving]);

  // face = its roadway part + block pieces + open pieces, so per-face
  // differences give hole-free roadway ground and exact coverage.
  const ground: GroundSurface[] = [];
  const addGround = (surface: GroundSurfaceKind, polygon: Polygon): void => {
    const levels = GROUND_LEVELS[surface];
    ground.push({ surface, polygon, bottom: levels.bottom, top: levels.top });
  };
  const piecesByFace = new Map<number, Polygon[]>();
  builtBlocks.forEach((b) => {
    (piecesByFace.get(b.faceIndex) ?? piecesByFace.set(b.faceIndex, []).get(b.faceIndex)!).push(b.boundary);
  });
  faces.forEach((face, fi) => {
    for (const poly of difference([face.polygon], piecesByFace.get(fi) ?? [])) {
      addGround('roadway', poly);
    }
  });
  for (const b of builtBlocks) for (const poly of b.curb) addGround('curb', poly);
  for (const b of builtBlocks) for (const poly of b.sidewalk) addGround('sidewalk', poly);
  for (const p of parcels) addGround('block', p.lot);
  for (const open of blockOpenAreas) for (const poly of open) addGround('open', poly);
  // the fringe is whatever the placed cover leaves of the boundary, so the partition is exact by construction
  const fringe = difference([boundary], ground.map((g) => g.polygon));
  for (const poly of fringe) addGround('open', poly);

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
  zonedParcels.forEach((z, i) => {
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
      gridAngle,
      boundary,
    },
    districts,
    streets: { nodes: streetNodes, edges: streetEdges, crossings, signals, planting, highwayStructures: structures },
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

/**
 * An alley is the pair of sidewalk bands its flanking blocks lay along it, so
 * its declared widths are those bands. A side with no block keeps the default.
 */
function adoptFlankingSidewalks(edge: StreetEdge, blocks: BuiltBlock[]): void {
  const half = lineLength(edge.path) / 2;
  const mid = pointAt(edge.path, half);
  const dir = directionAt(edge.path, half);
  for (const block of blocks) {
    if (!block.edgeIds.includes(edge.id)) continue;
    const side = cross(dir, sub(centroid(block.boundary), mid));
    if (side > 0) edge.sidewalk.left = block.sidewalkWidth;
    else if (side < 0) edge.sidewalk.right = block.sidewalkWidth;
  }
}

/** Point on the block's sidewalk band closest to any vertex of the lot. */
function closestSidewalkPoint(lot: Polygon, sidewalk: Polygon[]): Vec2 {
  let best: Vec2 = lot[0];
  let bestD = Infinity;
  for (const v of lot) {
    for (const ring of sidewalk) {
      for (let i = 0; i < ring.length; i++) {
        const { point } = closestOnSegment(v, ring[i], ring[(i + 1) % ring.length]);
        const d = dist(v, point);
        if (d < bestD) {
          bestD = d;
          best = point;
        }
      }
    }
  }
  return best;
}

function pruneUnusedStops(stops: BusStop[], usedIds: string[]): void {
  const used = new Set(usedIds);
  for (let i = stops.length - 1; i >= 0; i--) {
    if (!used.has(stops[i].id)) stops.splice(i, 1);
  }
}

/** How many fresh street seeds a city tries before refusing a non-planar network. */
const PLANAR_ATTEMPTS = 3;

/** Whether no two faces share ground beyond a sliver. */
function facesPlanar(faces: Face[]): boolean {
  const boxes = faces.map((f) => bounds(f.polygon));
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (a.max[0] <= b.min[0] || b.max[0] <= a.min[0] || a.max[1] <= b.min[1] || b.max[1] <= a.min[1]) continue;
      const shared = intersection([faces[i]!.polygon], [faces[j]!.polygon]).reduce((sum, p) => sum + area(p), 0);
      if (shared > PLANAR_SLIVER) return false;
    }
  }
  return true;
}

/** Square meters two faces may share through clipping noise. */
const PLANAR_SLIVER = 0.5;
