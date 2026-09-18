/** The atlas pipeline: seed + params to a complete CityBlueprint. */
import type {
  Block,
  BuildingGrid,
  CityBlueprint,
  District,
  Parcel,
  Polygon,
  StreetEdge,
  Vec2,
} from '../schema/blueprint';
import type { AtlasParams } from '../schema/params';
import { GENERATION_STAGES, GENERATION_TOTAL, type GenerationStageId, type ProgressObserver } from '../schema/progress';
import { Rng } from './core/rng';
import { resolveParams } from './params/defaults';
import { CityConstructionSupport } from './CityConstructionSupport';
import { unsatisfiable } from './errors';
import { CityLayout } from './CityLayout';
import { StreetReservations } from './streets/layout/reservations/StreetReservations';
import { CityGround } from './CityGround';
import { DistrictPlanner } from './districts/DistrictPlanner';
import { DistrictShapes } from './districts/DistrictShapes';
import { applyHighwayElevationProfiles, HIGHWAY_DECK, highwayEnvelopes, supportHighwayEnvelopes } from './streets/Highways';
import { streetNodesWithConnections } from './streets/Connections';
import { CityCrossings } from './CityCrossings';
import { Signals } from './streets/Signals';
import { Obstacles } from './streets/Planting';
import { CityFurniture } from './CityFurniture';
import { StreetCorridors } from './streets/construction/StreetCorridors';
import { Buildability } from './blocks/Buildability';
import { FootprintHost } from './zoning/FootprintHost';
import { BlockTemplates, placeOpenAreas, placeTemplate, StandardLots, STANDARD_LOT_SIZES, type BlockCells } from './blocks/StandardLots';
import { Zoning, LotInput } from './zoning/Zoning';
import { hostingProfiles } from './zoning/profiles';
import type { FootprintPolicy } from './zoning/FootprintPolicy';
import { INTERIOR } from './zoning/core';
import { TransitPlanner } from './transit/TransitPlanner';
import { Invariants } from './invariants/Invariants';
import { bufferLine, difference, intersection, snapPoint, union } from './geom/clip';
import { rectanglesOf } from './geom/rectangles';
import { snapToMillimetres } from './geom/millimetres';
import { PolygonIndex } from './geom/PolygonIndex';
import { area, bounds, centroid, distanceToOutline, pointInPolygon } from './geom/polygon';
import { length as lineLength, pointAt } from './geom/polyline';
import { closestOnSegment, dist } from './geom/vec';
import { GradeDatum } from './streets/construction/datum';
import { applyLandmarkFloors } from './landmarks';
import { planHydrology, withHydrologyStructures } from './hydro/Hydrology';
import { planArchitecture } from './architecture/Architecture';
import { Degradations } from './report/Degradations';
import { offGridStreets } from './invariants/clearLengths';
import { MIN_ENVELOPE_FLOORS } from './zoning/envelopes';

export const BLUEPRINT_VERSION = '0.26.0';
export const HYDROLOGY_BLUEPRINT_VERSION = BLUEPRINT_VERSION;

export function generateCity(input: AtlasParams, onProgress?: ProgressObserver): CityBlueprint {
  const progress = (id: GenerationStageId) => {
    const completed = GENERATION_STAGES.findIndex((stage) => stage.id === id);
    onProgress?.({ completed, total: GENERATION_TOTAL, phase: GENERATION_STAGES[completed]!.phase });
  };
  progress('settings');
  // One element never kills a plan: what fails its own check is simplified here and listed in `report`.
  const degradations = new Degradations();
  const params = resolveParams(input);
  CityConstructionSupport.assert(params.streetDesign);
  const seed = String(params.seed);

  progress('districts');
  // --- boundary, districts, streets -------------------------------------
  const boundary: Polygon = [[0, 0], [params.size.width, 0], [params.size.width, params.size.depth], [0, params.size.depth]];
  const plannedHydrology = planHydrology({ seed, size: params.size, boundary, config: params.hydrology });
  const waterSurfaces = plannedHydrology?.bodies.flatMap((body) => body.surfaces) ?? [];
  const planned = DistrictPlanner.plan(Rng.from(seed, 'districts'), boundary, params);
  const gridAngle = 0;
  const buildingGrid: BuildingGrid = { origin: [0, 0], angle: gridAngle, spacing: INTERIOR.snap };
  const footprintPolicy: FootprintPolicy = { grid: buildingGrid };
  const footprintHost = new FootprintHost(footprintPolicy);
  const cityCenter = centroid(boundary);
  const extent = Math.max(params.size.width, params.size.depth) * 3;
  const cells = DistrictShapes.cells(planned, boundary, extent, gridAngle);
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

  progress('grid');
  const layout = CityLayout.plan(params, point => {
    const index = districtOfPoint(point);
    const box = bounds(cells[index]);
    return { id: `d${index}`, kind: planned[index].kind, tier: planned[index].tier, center: planned[index].center,
      coreRadius: Math.min(box.max[0] - box.min[0], box.max[1] - box.min[1]) * 0.4 };
  }, waterSurfaces, planned.map(district => district.center));
  const graph = { nodes: layout.nodes, edges: layout.edges };
  const streetPlan = { edges: layout.edges, runs: layout.runs };
  progress('streets');
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
      ...(layout.modules.format === 'district' ? { districtStyle: planned[di].kind === 'industrial' ? 'industrial' as const
        : planned[di].tier === 'rich' || planned[di].tier === 'high_rich' ? 'luxury' as const : 'ordinary' as const } : {}),
    };
  });
  applyHighwayElevationProfiles(streetEdges);
  const envelopes = highwayEnvelopes(streetEdges);
  const streetEdgeById = new Map(streetEdges.map((e) => [e.id, e]));
  const highwayNoBuild = envelopes.flatMap(envelope => bufferLine(envelope.path, envelope.width + HIGHWAY_DECK.buildingClearance * 2));
  const vehicleEdges = streetEdges.filter((edge) => edge.class !== 'alley');
  const vehicleEdgeIds = new Set(vehicleEdges.map((edge) => edge.id));
  const vehicleNodes = graph.nodes.filter((node) => node.edgeIds.some((id) => vehicleEdgeIds.has(id)));
  const planner = new TransitPlanner(vehicleNodes, vehicleEdges);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const transitRng = Rng.from(seed, 'transit');

  progress('blocks');
  const builtBlocks = layout.builtBlocks;

  progress('parcels');
  // --- parcels ----------------------------------------------------------
  interface RawLot {
    polygon: Polygon;
    blockIndex: number;
    districtIndex: number;
    /** Standard catalog size, absent on a landmark lot. */
    sizeId?: string;
  }
  const rawLots: RawLot[] = [];
  const blockOpenAreas: Polygon[][] = builtBlocks.map(() => []);
  const blockDistrict: number[] = builtBlocks.map(block => districtOfPoint(centroid(block.boundary)));
  const sidewalkedEdges: string[][] = builtBlocks.map((b) =>
    b.edgeIds.filter((id) => {
      const e = streetEdgeById.get(id);
      return e !== undefined && (e.sidewalk.left > 0 || e.sidewalk.right > 0);
    }),
  );
  const existingInfrastructure = highwayNoBuild;
  const capacity = Zoning.populationForecast(planned.map((district, index) => ({
    districtId: `d${index}`, kind: district.kind, tier: district.tier, maxFloors: district.maxFloors,
    landArea: builtBlocks.reduce((sum, block, blockIndex) => blockDistrict[blockIndex] !== index ? sum : sum
      + difference(block.interior, [...waterSurfaces, ...existingInfrastructure]).reduce((total, polygon) => total + area(polygon), 0), 0),
  })));
  // A subway that cannot reserve its platforms or entrances leaves the city without one.
  const subwayPlan = params.features.subways ? degradations.attempt('station', 'subway', () => planner.planSubway({
    districts: planned,
    districtOfNode: (nodeId) => districtOfPoint(nodeById.get(nodeId)!.position),
    cityCenter, boundary, populationEstimate: capacity.populationEstimate,
    entranceObstacles: [...waterSurfaces, ...existingInfrastructure],
    stationExclusion: waterSurfaces,
    rng: transitRng,
  }), undefined) : undefined;
  const subwayBayPaving = subwayPlan?.subwayStations.flatMap((station) => station.entranceBays?.map((bay) => bay.footprint) ?? []) ?? [];
  const infrastructureNoBuild = union([...existingInfrastructure, ...subwayBayPaving]);
  // --- standard lots: every block is tiled by its size-and-zone template, leftovers stay open ---
  const templates = new BlockTemplates(seed);
  const blockTemplateId: (string | undefined)[] = builtBlocks.map(() => undefined);
  const blockTemplateLots: number[] = builtBlocks.map(() => 0);
  const blockCells: BlockCells[] = [];
  const reservedLand = new PolygonIndex([...waterSurfaces, ...infrastructureNoBuild]);
  builtBlocks.forEach((block, blockIndex) => {
    const kind = planned[blockDistrict[blockIndex]].kind;
    const interior = block.interior[0];
    const box = bounds(interior), outer = bounds(block.boundary);
    const template = templates.get({ origin: outer.min, width: outer.max[0] - outer.min[0], depth: outer.max[1] - outer.min[1],
      interior: { offset: [box.min[0] - outer.min[0], box.min[1] - outer.min[1]],
        width: box.max[0] - box.min[0], depth: box.max[1] - box.min[1] } }, kind);
    // A block reachable only via highways gets no parcels: open ground instead.
    const served = sidewalkedEdges[blockIndex].length > 0;
    const placed = served ? placeTemplate(template, outer.min) : [];
    const blocked = (polygon: Polygon): boolean => {
      const near = reservedLand.near(polygon);
      return near.length > 0 && intersection([polygon], near).some(piece => area(piece) > 1e-6);
    };
    const cells = placed.filter(cell => !blocked(cell.polygon));
    if (served && cells.length === placed.length) {
      blockTemplateId[blockIndex] = template.id;
      blockTemplateLots[blockIndex] = template.lots.length;
      blockOpenAreas[blockIndex].push(...placeOpenAreas(template, outer.min));
    } else {
      blockOpenAreas[blockIndex].push(...rectanglesOf(difference([interior], cells.map(cell => cell.polygon)))
        .filter(piece => area(piece) > 1));
    }
    blockCells.push({ blockIndex, cells });
  });
  const landmarks = StandardLots.landmarks(blockCells, Rng.from(seed, 'landmark-lots'));
  for (const { blockIndex, cells } of blockCells) {
    const districtIndex = blockDistrict[blockIndex];
    const landmark = landmarks.get(blockIndex);
    if (landmark) rawLots.push({ polygon: landmark.polygon, blockIndex, districtIndex });
    const absorbed = new Set(landmark?.cells);
    for (const value of cells) {
      if (!absorbed.has(value)) rawLots.push({ polygon: value.polygon, blockIndex, districtIndex, sizeId: value.sizeId });
    }
  }
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
  if (buildable.lots.length === 0) throw unsatisfiable('no buildable parcels produced; enlarge size');
  const retypeRng = Rng.from(seed, 'retype');
  const built = new Map(buildable.lots.map((lot) => [lot.index, { lot,
    zoned: lot.profile === 0 ? zoned[lot.index] : Zoning.retype(zoned[lot.index], planned[rawLots[lot.index].districtIndex], retypeRng.fork(lot.index)) }]));

  // access: the block sidewalk point nearest the lot, then the edge serving it
  const access = (raw: RawLot): Parcel['access'] => {
    const point = snapPoint(closestSidewalkPoint(raw.polygon, builtBlocks[raw.blockIndex].sidewalk, waterSurfaces));
    let edgeId = sidewalkedEdges[raw.blockIndex][0];
    let best = Infinity;
    for (const candidate of sidewalkedEdges[raw.blockIndex]) {
      const e = streetEdgeById.get(candidate)!;
      for (let s = 0; s < e.path.length - 1; s++) {
        const d = dist(point, closestOnSegment(point, e.path[s], e.path[s + 1]).point);
        if (d < best) { best = d; edgeId = candidate; }
      }
    }
    return { edgeId, point };
  };

  const parcels: Parcel[] = [];
  const residents: number[] = [];
  rawLots.forEach((raw, index) => {
    const entry = built.get(index);
    const id = `p${parcels.length}`;
    const common = {
      id,
      blockId: `b${raw.blockIndex}`,
      districtId: `d${raw.districtIndex}`,
      tier: zoned[index].tier,
      lot: raw.polygon,
      access: access(raw),
      ...(raw.sizeId ? { lotSize: raw.sizeId } : { landmark: true as const }),
    };
    // floors stay within what the hosted core allows
    let envelope = entry?.zoned.envelope;
    if (entry && envelope && envelope.maxFloors > entry.lot.floorCap) {
      const maxFloors = entry.lot.floorCap;
      envelope = {
        minFloors: Math.min(envelope.minFloors, maxFloors),
        maxFloors,
        floorHeight: envelope.floorHeight,
        maxHeight: Math.round(maxFloors * envelope.floorHeight * 100) / 100,
      };
    }
    // a lot that carries no two-floor building is public green, not a building parcel
    if (!entry || !envelope || envelope.maxFloors < MIN_ENVELOPE_FLOORS) {
      degradations.add('lot', id, entry ? 'lot carries fewer than two floors' : 'lot hosts no building core');
      parcels.push({ ...common, type: 'park' });
      residents.push(0);
      return;
    }
    const z = entry.zoned;
    // capacity follows the final lot, which a merge may have grown
    if (z.type === 'residential') z.residents = Zoning.residentsFor(area(raw.polygon), envelope);
    parcels.push({ ...common, type: z.type, footprint: entry.lot.footprint, envelope });
    residents.push(z.residents);
  });

  // --- blocks and districts to schema ------------------------------------
  // A block names its template only when its parcels are exactly the template's
  // lots: a landmark merge or a lot the zoning could not build breaks that.
  const blocks: Block[] = builtBlocks.map((b, i) => {
    const parcelIds = parcels.filter((p) => p.blockId === `b${i}`);
    const tiled = blockTemplateId[i] !== undefined && parcelIds.length === blockTemplateLots[i]
      && parcelIds.every((p) => p.lotSize !== undefined);
    return {
      id: `b${i}`,
      districtId: `d${blockDistrict[i]}`,
      boundary: b.boundary,
      ...(tiled ? { template: blockTemplateId[i] } : {}),
      curb: b.curb,
      sidewalk: b.sidewalk,
      parcelIds: parcelIds.map((p) => p.id),
      openAreas: blockOpenAreas[i],
    };
  });

  const districts: District[] = planned.map((d, i) => ({
    id: `d${i}`,
    kind: d.kind,
    tier: d.tier,
    boundary: cells[i],
    center: d.center,
    maxFloors: d.maxFloors,
  }));

  progress('transit');
  // --- transit -----------------------------------------------------------
  const population = residents.reduce((sum, value) => sum + value, 0);
  const transit: CityBlueprint['transit'] = {
    busStops: [], busRoutes: [], trainStations: [], trainLines: [],
    subwayStations: subwayPlan?.subwayStations ?? [], subwayLines: subwayPlan?.subwayLines ?? [],
    ...(subwayPlan?.subwayDemand ? { subwayDemand: subwayPlan.subwayDemand } : {}),
  };

  progress('ground');
  // --- crossings, ground, volumetric -------------------------------------
  const streetNodes = streetNodesWithConnections(graph.nodes, streetEdges);
  const subwayShafts = transit.subwayStations.flatMap((station) => station.shafts.map((shaft) => shaft.footprint));

  const ground = CityGround.build({ boundary, water: waterSurfaces, roadway: layout.roadway,
    blockBounds: layout.blocks.map(block => block.outer), modules: layout.cover,
    lots: parcels.map(parcel => parcel.lot), open: blockOpenAreas.flat(), stationBays: subwayBayPaving });
  const pedestrianPaving = ground.filter((region) => region.surface === 'curb' || region.surface === 'sidewalk').map((region) => region.polygon);
  const planningReservations = StreetCorridors.reservations(streetEdges);
  const gradeRoadway = planningReservations.edges.filter(reservation => {
    const kind = streetEdgeById.get(reservation.edgeId)!.class;
    return kind === 'street' || kind === 'road';
  }).flatMap(reservation => reservation.roadway);
  const structures = supportHighwayEnvelopes(envelopes, [...subwayShafts, ...pedestrianPaving, ...gradeRoadway]);
  const crossingObstacles = GradeDatum.clearanceFootprints({
    plan: GradeDatum.physicalPlan({ boundary, edges: streetEdges, structures }),
    supports: structures.flatMap((structure) => structure.supports.map((support) => ({ structureEdgeIds: structure.edgeIds, support }))),
    groundTop: 0.2,
    clearHeight: params.streetDesign.crossings!.pedestrianClearance,
  }).flatMap((owner) => owner.polygons);
  progress('crossings');
  const crossingPlan = CityCrossings.plan({ nodes: streetNodes, edges: streetEdges, ground, obstacles: crossingObstacles,
    landExclusions: { water: waterSurfaces, blocks: layout.waterExcludedBlocks }, report: degradations });
  for (const { edgeId, clear } of offGridStreets(streetEdges, crossingPlan.junctions.flatMap(junction => junction.approaches))) {
    degradations.add('corridor', edgeId, `street keeps no junction box and its own ${clear.toFixed(2)} m length is off the 2 m grid`);
  }
  const crossings = crossingPlan.crossings;
  const signals = Signals.build(streetNodes, streetEdges, crossingPlan.junctions);

  // Street furniture keeps clear of the complete crossing landings and existing accesses.
  const obstacles = new Obstacles();
  obstacles.add(crossings.flatMap((c) => c.segments.flatMap((s) => [s.from, s.to])));
  obstacles.add(signals.map((s) => s.position));
  obstacles.add(transit.subwayStations.flatMap((s) => s.entrances));
  obstacles.add(parcels.map((p) => p.access.point));
  const planting = CityFurniture.place({ edges: streetEdges, ground, modules: layout.modules, obstacles,
    districtOf: edgeId => planned[edgeDistrict.get(edgeId) ?? 0].kind, rng: Rng.from(seed, 'planting') });

  const heightRng = Rng.from(seed, 'volumetric');
  const volumetric = {
    // A park carries no building.
    buildings: parcels.flatMap((p) => p.footprint && p.envelope ? [{
      parcelId: p.id,
      footprint: p.footprint,
      height: Math.round(heightRng.int(p.envelope.minFloors, p.envelope.maxFloors) * p.envelope.floorHeight * 100) / 100,
    }] : []),
    ground,
  };

  const corridors = plannedHydrology ? new StreetCorridors(streetEdges) : undefined;
  const hydrology = plannedHydrology && withHydrologyStructures(plannedHydrology, [
    ...streetEdges.map((edge) => ({
      network: 'street' as const,
      refId: edge.id,
      path: edge.path,
      width: edge.width + edge.sidewalk.left + edge.sidewalk.right,
      corridor: corridors!.byEdge.get(edge.id),
      level: edge.level,
    })).filter((edge) => edge.width > 0),
    ...transit.subwayLines.map((line) => ({ network: 'subway' as const, refId: line.id, path: line.path, width: line.width, level: line.level })),
  ]);

  progress('assembly');
  // --- stats --------------------------------------------------------------
  const emptyCounts = (): Record<string, number> =>
    Object.fromEntries(
      ['residential', 'hotel', 'offices', 'corpo', 'hospital', 'clinic', 'police', 'military', 'factory', 'commerce', 'mall', 'restaurant', 'coffee_shop', 'park'].map((t) => [t, 0]),
    );
  const parcelCounts = emptyCounts();
  const perDistrictMap = new Map<string, { population: number; parcelCounts: Record<string, number> }>();
  for (const d of districts) perDistrictMap.set(d.id, { population: 0, parcelCounts: emptyCounts() });
  parcels.forEach((p, i) => {
    parcelCounts[p.type] += 1;
    const entry = perDistrictMap.get(p.districtId)!;
    entry.parcelCounts[p.type] += 1;
    entry.population += residents[i];
  });

  const architecture = planArchitecture({ nodes: streetNodes, edges: streetEdges, highwayStructures: structures });

  const reservations = StreetReservations.build({ planning: layout.planning, layoutBlocks: layout.blocks, modules: layout.modules,
    streets: { nodes: streetNodes, edges: streetEdges, highwayStructures: structures }, blocks, parcels, transit, volumetric });

  const blueprint: CityBlueprint = {
    meta: {
      version: hydrology ? HYDROLOGY_BLUEPRINT_VERSION : BLUEPRINT_VERSION,
      seed,
      params: params as CityBlueprint['meta']['params'],
      bounds: bounds(boundary),
      units: 'meters',
      gridAngle,
      buildingGrid,
      lotSizes: STANDARD_LOT_SIZES.map(size => ({ ...size })),
      blockTemplates: templates.published(),
      boundary,
    },
    districts,
    streets: { nodes: streetNodes, edges: streetEdges, crossings, signals, planting, highwayStructures: structures,
      construction: {
        version: '1.0.0', runs: streetPlan.runs, modules: layout.modules, reservations,
        ...(layout.medians.length ? { medians: layout.medians } : {}),
        ...(layout.waterExcludedBlocks.length ? { waterExcludedBlocks: layout.waterExcludedBlocks } : {}),
        planningReservations,
        junctions: crossingPlan.junctions,
      } },
    architecture,
    blocks,
    parcels,
    transit,
    ...(hydrology ? { hydrology } : {}),
    volumetric,
    report: { degraded: degradations.published() },
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

  progress('validation');
  const result = params.landmarkFloors ? applyLandmarkFloors(blueprint, params.landmarkFloors) : blueprint;
  Invariants.check(result);
  progress('storage');
  // Published last: rounding onto the grid the contract states costs no
  // geometry (every coordinate is already there) and a fifth of the bytes.
  return snapToMillimetres(result);
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
