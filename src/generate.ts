/** The atlas pipeline: seed + params to a complete CityBlueprint. */
import type {
  Block,
  BuildingGrid,
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
import { CityConstructionSupport } from './CityConstructionSupport';
import { unsatisfiable } from './errors';
import { CityBoundary } from './boundary/CityBoundary';
import { DistrictPlanner } from './districts/DistrictPlanner';
import { DistrictShapes } from './districts/DistrictShapes';
import { StreetGrowth } from './streets/StreetGrowth';
import { StreetDomain } from './streets/domain/StreetDomain';
import { AlleyPlanner } from './streets/AlleyPlanner';
import { StreetGraphBuilder } from './streets/Graph';
import { applyHighwayElevationProfiles, ensureUsableHighway, HIGHWAY_DECK, highwayStructures } from './streets/Highways';
import { streetNodesWithConnections } from './streets/Connections';
import { FaceExtractor } from './streets/Faces';
import type { Face } from './streets/Faces';
import { Crossings } from './streets/Crossings';
import { Signals } from './streets/Signals';
import { Obstacles, Planting } from './streets/Planting';
import { BlockBuilder } from './blocks/BlockBuilder';
import { StreetSections } from './streets/construction/StreetSections';
import { StreetCorridors } from './streets/construction/StreetCorridors';
import { Buildability } from './blocks/Buildability';
import { FootprintHost } from './zoning/FootprintHost';
import { Subdivision, SubdivisionConfig } from './blocks/Subdivision';
import { Zoning, LotInput } from './zoning/Zoning';
import { hostingProfiles } from './zoning/profiles';
import type { FootprintPolicy } from './zoning/FootprintPolicy';
import { INTERIOR } from './zoning/core';
import { TransitPlanner } from './transit/TransitPlanner';
import { Invariants } from './invariants/Invariants';
import { bufferLine, difference, intersection, offset, snapPoint, union } from './geom/clip';
import { area, bounds, centroid, distanceToOutline, pointInPolygon } from './geom/polygon';
import { length as lineLength, pointAt } from './geom/polyline';
import { closestOnSegment, dist } from './geom/vec';
import { cityGridAngle } from './grid';
import { RAIL, STATION } from './transit/stations';
import { GROUND_LEVELS, type GroundSurfaceKind } from './streets/surfaces';
import { GroundRoadway } from './streets/GroundRoadway';
import { planHydrology, withHydrologyStructures } from './hydro/Hydrology';

export const BLUEPRINT_VERSION = '0.17.0';
export const HYDROLOGY_BLUEPRINT_VERSION = BLUEPRINT_VERSION;

const SUBDIVISION: Record<DistrictKind, SubdivisionConfig> = {
  downtown: { minLotArea: 500, maxLotArea: 2600, chanceNoDivide: 0.12 },
  commercial: { minLotArea: 400, maxLotArea: 3200, chanceNoDivide: 0.12 },
  residential: { minLotArea: 260, maxLotArea: 1300, chanceNoDivide: 0.12 },
  industrial: { minLotArea: 1500, maxLotArea: 9000, chanceNoDivide: 0.2 },
  mixed: { minLotArea: 300, maxLotArea: 1900, chanceNoDivide: 0.12 },
};

export function generateCity(input: AtlasParams): CityBlueprint {
  const params = resolveParams(input);
  CityConstructionSupport.assert(params.streetDesign);
  const seed = String(params.seed);

  // --- boundary, districts, streets -------------------------------------
  const boundary = CityBoundary.generate(Rng.from(seed, 'boundary'), params.size, params.irregularity);
  const plannedHydrology = planHydrology({ seed, size: params.size, boundary, config: params.hydrology });
  const waterSurfaces = plannedHydrology?.bodies.flatMap((body) => body.surfaces) ?? [];
  const planned = DistrictPlanner.plan(Rng.from(seed, 'districts'), boundary, params);
  const gridAngle = cityGridAngle(Rng.from(seed, 'grid'));
  const buildingGrid: BuildingGrid = { origin: [0, 0], angle: gridAngle, spacing: INTERIOR.snap };
  const footprintPolicy: FootprintPolicy = { shape: params.footprintShape, grid: buildingGrid };
  const footprintHost = new FootprintHost(footprintPolicy);
  const streetDomain = StreetDomain.reserve({
    boundary, design: params.streetDesign, highways: params.features.highways, alleys: params.features.alleys,
  });
  const field = StreetGrowth.buildField(boundary, params, planned, gridAngle);
  let lines = StreetGrowth.grow(field, streetDomain, Rng.from(seed, 'streets'), params, planned);

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
    StreetGraphBuilder.build(traced, {
      simplifyTolerance: 1.5, snapRadius: params.irregularity === 0 ? 0 : 10, domain: streetDomain,
    });
  const facesOf = (edges: ReturnType<typeof buildGraph>['edges']): Face[] =>
    FaceExtractor.faces(edges, 400, area(boundary) / 2);
  const sectionsOf = (graph: ReturnType<typeof buildGraph>): ReturnType<typeof StreetSections.plan> =>
    StreetSections.plan(graph.edges, graph.nodes, params.streetDesign, (point) => planned[districtOfPoint(point)].kind);

  let graph = buildGraph(lines);
  if (graph.edges.length < 8) throw unsatisfiable('street network too small; enlarge size', { edges: graph.edges.length });
  let faces = facesOf(graph.edges);
  // Two faces sharing ground means the tracer left a crossing the graph could not resolve;
  // the streets are grown again from the next seed in line, a few times, then the city refuses.
  for (let attempt = 1; !facesPlanar(faces) && attempt <= PLANAR_ATTEMPTS; attempt++) {
    lines = StreetGrowth.grow(field, streetDomain, Rng.from(seed, `streets:${attempt}`), params, planned);
    graph = buildGraph(lines);
    faces = graph.edges.length < 8 ? [] : facesOf(graph.edges);
  }
  if (graph.edges.length < 8 || !facesPlanar(faces)) {
    throw unsatisfiable('street network never planar for this seed and size; change either', { edges: graph.edges.length });
  }
  if (params.features.alleys) {
    const land = BlockBuilder.pieces(faces, new StreetCorridors(sectionsOf(graph).edges).roadway);
    const alleys = AlleyPlanner.plan(
      land.map((piece) => piece.polygon),
      graph.nodes.map((n) => n.position),
      (p) => planned[districtOfPoint(p)],
      Rng.from(seed, 'alleys'),
      { edges: graph.edges, domain: streetDomain },
    );
    if (alleys.length > 0) {
      const withAlleys = StreetGraphBuilder.extend(graph,
        alleys.map((path) => ({ path, class: 'alley' as const })), { domain: streetDomain });
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
  const streetPlan = sectionsOf(graph);
  const edgeDistrict = new Map<string, number>();
  const streetEdges: StreetEdge[] = streetPlan.edges.map((e) => {
    const mid = pointAt(e.path, lineLength(e.path) / 2);
    const di = districtOfPoint(mid);
    edgeDistrict.set(e.id, di);
    const districtIds = [...new Set([districtOfPoint(e.path[0]), di, districtOfPoint(e.path[e.path.length - 1])])]
      .sort((a, b) => a - b)
      .map((i) => `d${i}`);
    return {
      ...e,
      districtIds,
    };
  });
  applyHighwayElevationProfiles(streetEdges);
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
  const trainStationExclusion = union([
    ...streetEdges
      .filter((edge) => edge.class === 'highway')
      .flatMap((edge) => bufferLine(
        edge.path,
        edge.width
          + Math.hypot(STATION.train.platformLength, STATION.train.platformWidth)
          + RAIL.buildingClearance * 2,
      )),
    ...offset(waterSurfaces, Math.hypot(STATION.train.platformLength, STATION.train.platformWidth) / 2 + 1),
  ]);
  // Transit runs on the driveable graph. The train is planned now because its
  // grade-level right-of-way must be removed before parcels are subdivided.
  const vehicleEdges = streetEdges.filter((edge) => edge.class !== 'alley');
  const vehicleEdgeIds = new Set(vehicleEdges.map((edge) => edge.id));
  const vehicleNodes = graph.nodes.filter((node) => node.edgeIds.some((id) => vehicleEdgeIds.has(id)));
  const planner = new TransitPlanner(vehicleNodes, vehicleEdges);
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
  const alleyPaths = new Map<string, Vec2[]>();
  for (const e of graph.edges) {
    if (alleyEdgeIds.has(e.id)) {
      alleyPaths.set(e.id, e.path);
    }
  }
  const corridors = new StreetCorridors(streetEdges);
  const roadwayBuffers = corridors.roadway;
  const alleyPaving = corridors.pedestrian;
  const builtBlocks = BlockBuilder.build(
    faces,
    roadwayBuffers,
    alleyPaths,
    alleyPaving,
    corridors.full,
    Rng.from(seed, 'curbs'),
  );

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
  const existingInfrastructure = union([...highwayNoBuild, ...trainNoBuild]);
  const capacity = Zoning.populationForecast(planned.map((district, index) => ({
    districtId: `d${index}`, kind: district.kind, tier: district.tier, maxFloors: district.maxFloors,
    landArea: builtBlocks.reduce((sum, block, blockIndex) => blockDistrict[blockIndex] !== index ? sum : sum
      + difference(block.interior, [...waterSurfaces, ...existingInfrastructure]).reduce((total, polygon) => total + area(polygon), 0), 0),
  })));
  const subwayPlan = params.features.subways ? planner.planSubway({
    districts: planned,
    districtOfNode: (nodeId) => districtOfPoint(nodeById.get(nodeId)!.position),
    cityCenter, boundary, populationEstimate: capacity.populationEstimate,
    entranceObstacles: [...waterSurfaces, ...existingInfrastructure, ...alleyPaving],
    stationExclusion: waterSurfaces,
    rng: transitRng,
  }) : undefined;
  const subwayBayPaving = subwayPlan?.subwayStations.flatMap((station) => station.entranceBays?.map((bay) => bay.footprint) ?? []) ?? [];
  const infrastructureNoBuild = union([...existingInfrastructure, ...subwayBayPaving]);
  builtBlocks.forEach((block, blockIndex) => {
    const districtIndex = blockDistrict[blockIndex];
    const cfg = SUBDIVISION[planned[districtIndex].kind];
    const rng = lotRng.fork(blockIndex);
    const landInterior = waterSurfaces.length > 0 ? difference(block.interior, waterSurfaces) : block.interior;
    const reserved = intersection(landInterior, infrastructureNoBuild);
    blockOpenAreas[blockIndex].push(...reserved);
    for (const interior of difference(landInterior, infrastructureNoBuild)) {
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
  const zoned = Zoning.assign(lotInputs, planned, cityCenter, Rng.from(seed, 'zoning'), footprintHost);

  // buildability: the footprint hosts its type's band and core, else the
  // district's light type's, else the lot is no parcel
  const buildable = Buildability.enforce(
    rawLots.map((l, i) => ({
      polygon: l.polygon,
      blockIndex: l.blockIndex,
      profiles: hostingProfiles(zoned[i].type, Zoning.fallbackType(planned[l.districtIndex].kind)),
    })), footprintHost,
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
    const accessPoint = snapPoint(closestSidewalkPoint(lot.polygon, block.sidewalk, waterSurfaces));
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
  const transit = planner.plan({
    districts: planned,
    districtOfNode: (nodeId) => districtOfPoint(nodeById.get(nodeId)!.position),
    cityCenter,
    boundary,
    population,
    features: params.features,
    trainPlan,
    subwayPlan,
    rng: transitRng,
  });
  pruneUnusedStops(transit.busStops, transit.busRoutes.flatMap((r) => r.stopIds));
  if (waterSurfaces.length > 0) pruneWaterStops(transit, waterSurfaces);

  // --- crossings, ground, volumetric -------------------------------------
  const crossings = Crossings.build(graph.nodes, streetEdges);
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
  ).filter((item) => !waterSurfaces.some((surface) => pointInPolygon(item.position, surface)));
  const subwayShafts = transit.subwayStations.flatMap((station) => station.shafts.map((shaft) => shaft.footprint));

  // Ground ownership follows the full network, including unbounded and small faces.
  const ground: GroundSurface[] = [];
  const addGround = (surface: GroundSurfaceKind, polygon: Polygon, reserved: Polygon[] = subwayBayPaving): void => {
    const levels = GROUND_LEVELS[surface];
    const pieces = difference([polygon], [...waterSurfaces, ...reserved]);
    for (const piece of pieces) ground.push({ surface, polygon: piece, bottom: levels.bottom, top: levels.top });
  };
  for (const poly of GroundRoadway.build(boundary, [...roadwayBuffers.values()].flat(), faces, builtBlocks)) {
    addGround('roadway', poly);
  }
  for (const b of builtBlocks) for (const poly of b.curb) addGround('curb', poly);
  for (const b of builtBlocks) for (const poly of b.sidewalk) addGround('sidewalk', poly);
  for (const p of parcels) addGround('block', p.lot);
  for (const open of blockOpenAreas) for (const poly of open) addGround('open', poly);
  for (const poly of difference(intersection(corridors.full, [boundary]), ground.map((region) => region.polygon))) {
    addGround('sidewalk', poly);
  }
  for (const poly of subwayBayPaving) addGround('sidewalk', poly, []);
  // the fringe is whatever the placed cover leaves of the boundary, so the partition is exact by construction
  const fringe = difference([boundary], ground.map((g) => g.polygon));
  for (const poly of fringe) addGround('open', poly);
  const pedestrianPaving = ground.filter((region) => region.surface === 'curb' || region.surface === 'sidewalk').map((region) => region.polygon);
  const structures = highwayStructures(streetEdges, [...trainNoBuild, ...subwayShafts, ...pedestrianPaving]);

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

  const hydrology = withHydrologyStructures(plannedHydrology, [
    ...streetEdges.map((edge) => ({
      network: 'street' as const,
      refId: edge.id,
      path: edge.path,
      width: edge.width + edge.sidewalk.left + edge.sidewalk.right,
      corridor: corridors.byEdge.get(edge.id),
      level: edge.level,
    })).filter((edge) => edge.width > 0),
    ...transit.trainLines.map((line) => ({ network: 'train' as const, refId: line.id, path: line.path, width: line.width, level: line.level })),
    ...transit.subwayLines.map((line) => ({ network: 'subway' as const, refId: line.id, path: line.path, width: line.width, level: line.level })),
  ]);

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
      version: hydrology ? HYDROLOGY_BLUEPRINT_VERSION : BLUEPRINT_VERSION,
      seed,
      params: params as CityBlueprint['meta']['params'],
      bounds: bounds(boundary),
      units: 'meters',
      gridAngle,
      buildingGrid,
      boundary,
    },
    districts,
    streets: { nodes: streetNodes, edges: streetEdges, crossings, signals, planting, highwayStructures: structures,
      construction: {
        version: '1.0.0', runs: streetPlan.runs,
        planningReservations: StreetCorridors.reservations(streetEdges),
      } },
    blocks,
    parcels,
    transit,
    ...(hydrology ? { hydrology } : {}),
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

/** Point on the block's sidewalk band closest to any vertex of the lot. */
function closestSidewalkPoint(lot: Polygon, sidewalk: Polygon[], water: Polygon[] = []): Vec2 {
  let best: Vec2 = lot[0];
  let bestD = Infinity;
  for (const v of lot) {
    for (const ring of sidewalk) {
      for (let i = 0; i < ring.length; i++) {
        const start = ring[i];
        const end = ring[(i + 1) % ring.length];
        const projected = closestOnSegment(v, start, end).point;
        const projectedIsClear = !water.some((surface) => pointInPolygon(projected, surface) || distanceToOutline(projected, surface) < 0.001);
        const candidates = water.length === 0 || projectedIsClear
          ? [projected]
          : Array.from({ length: 17 }, (_, step): Vec2 => [
              start[0] + (end[0] - start[0]) * step / 16,
              start[1] + (end[1] - start[1]) * step / 16,
            ]);
        for (const candidate of candidates) {
          if (water.some((surface) => pointInPolygon(candidate, surface) || distanceToOutline(candidate, surface) < 0.001)) continue;
          const d = dist(v, candidate);
          if (d < bestD) {
            bestD = d;
            best = candidate;
          }
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

function pruneWaterStops(transit: CityBlueprint['transit'], water: Polygon[]): void {
  const removed = new Set(transit.busStops.filter((stop) => water.some((surface) => pointInPolygon(stop.position, surface))).map((stop) => stop.id));
  transit.busStops = transit.busStops.filter((stop) => !removed.has(stop.id));
  transit.busRoutes = transit.busRoutes
    .map((route) => ({ ...route, stopIds: route.stopIds.filter((id) => !removed.has(id)) }))
    .filter((route) => route.stopIds.length >= 2);
  pruneUnusedStops(transit.busStops, transit.busRoutes.flatMap((route) => route.stopIds));
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
