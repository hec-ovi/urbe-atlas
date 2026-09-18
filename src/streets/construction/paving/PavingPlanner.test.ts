import { describe, expect, it } from 'vitest';
import type { GroundSurface, Polygon, StreetEdge, StreetNode, Vec2 } from '../../../../schema/blueprint';
import { difference, union } from '../../../geom/clip';
import { pointInPolygon } from '../../../geom/polygon';
import { SourcePartition } from '../../../geom/partition/SourcePartition';
import { edgeMaskView } from '../../../geom/partition/EdgeMasks';
import { CrossingPlanner } from '../../crossings/CrossingPlanner';
import { resolveStreetDesign } from '../Design';
import { StreetSections } from '../StreetSections';
import { StreetCorridors } from '../StreetCorridors';
import { PavingPlanner } from './PavingPlanner';
import { legacyStreetDesign } from './fixtures/legacyStreetDesign';
import type { PavingInput, PavingOutput, PublishedPavingInput, SharedPavingInput } from './producer-schema';
import type { PavingDesign, PavingFrame, PavingModule } from './schema';

const rect = (x0: number, z0: number, x1: number, z1: number): Polygon => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const ground = (polygon: Polygon, surface: GroundSurface['surface'] = 'sidewalk'): GroundSurface => ({ polygon, surface, bottom: 0, top: 0.15 });

function design(): PavingDesign {
  return {
    defaultLayoutId: 'fitted', districtLayouts: [], layouts: [{
      id: 'fitted', familyId: 'maintained',
      modules: [
        { id: 'slab', pitch: [2, 2], joint: [0.012, 0.012] },
        { id: 'kerb', pitch: [2, 0.15], joint: [0.012, 0.005] },
        { id: 'border', pitch: [2, 0.35], joint: [0.012, 0.012] },
        { id: 'service', pitch: [2, 1.5], joint: [0.012, 0.012] },
        { id: 'front', pitch: [2, 1], joint: [0.012, 0.012] },
      ],
      bands: { curb: { moduleId: 'kerb', borderWidth: 0 }, border: { moduleId: 'border', borderWidth: 0 },
        furnishing: { moduleId: 'service', borderWidth: 0 }, walking: { moduleId: 'slab', borderWidth: 0.05 },
        frontage: { moduleId: 'front', borderWidth: 0 } },
    }],
  };
}

function groupedDesign(): PavingDesign {
  const result = design(), layout = result.layouts[0];
  for (const module of layout.modules) module.pitch[0] = 1;
  layout.modules[0].pitch[1] = 1;
  layout.modules.push({ id: 'large', pitch: [2, 2], baseCells: [2, 2], joint: [0.012, 0.012] });
  layout.bands.walking.grouping = { moduleId: 'large', period: [4, 2], offset: [0, 0] };
  return result;
}

function input(paths: Vec2[][] = [[[0, 0], [24, 0]]]): PavingInput {
  const nodes: StreetNode[] = [];
  const edges: StreetEdge[] = paths.map((path, index) => {
    const endpoints = [path[0], path[path.length - 1]].map(position => {
      let node = nodes.find(candidate => candidate.position[0] === position[0] && candidate.position[1] === position[1]);
      if (!node) {
        node = { id: `n${nodes.length}`, position, edgeIds: [], connections: [] };
        nodes.push(node);
      }
      node.edgeIds.push(`e${index}`);
      node.connections = [{ level: 0, edgeIds: node.edgeIds }];
      return node;
    });
    const length = path.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - path[i][0], point[1] - path[i][1]), 0);
    return { id: `e${index}`, from: endpoints[0].id, to: endpoints[1].id, path, class: 'street', width: 7,
      sidewalk: { left: 0, right: 0 }, districtIds: ['d0'], level: 0, elevationProfile: [{ distance: 0, level: 0 }, { distance: length, level: 0 }] };
  });
  const planned = StreetSections.plan(edges, nodes, legacyStreetDesign(), () => 'downtown');
  return { streets: { nodes, edges: planned.edges, crossings: [], construction: { version: '1.0.0', runs: planned.runs } },
    districts: [{ id: 'd0', boundary: rect(-100, -100, 100, 100) }], design: design(),
    ground: [ground(rect(0, 3.5, 24, 3.65), 'curb'), ground(rect(0, 3.65, 24, 10)), ground(rect(0, -3.5, 24, 3.5), 'roadway')] };
}

// Independent expansion of the frozen consumer formula, not the producer's helper.
function footprint(frame: PavingFrame, module: PavingModule, column: number, row: number): Polygon {
  const countU = module.baseCells?.[0] ?? 1, countV = module.baseCells?.[1] ?? 1;
  const indices: [number, number][] = [];
  for (let u = 0; u < countU; u++) indices.push([u, 0]);
  for (let v = 0; v < countV; v++) indices.push([countU, v]);
  for (let u = countU; u > 0; u--) indices.push([u, countV]);
  for (let v = countV; v > 0; v--) indices.push([0, v]);
  return indices.map(([u, v]) => {
    const du = (column * countU + u) * (module.pitch[0] / countU);
    const dv = (row * countV + v) * (module.pitch[1] / countV);
    return [Math.round(((frame.origin[0] + frame.u[0] * du) - frame.u[1] * dv) * 1000) / 1000,
      Math.round(((frame.origin[1] + frame.u[1] * du) + frame.u[0] * dv) * 1000) / 1000];
  });
}

function surfaceArea(polygons: Polygon[]): number {
  return polygons.reduce((sum, polygon) => {
    const a = polygon[0];
    return sum + polygon.slice(1, -1).reduce((area, b, index) => {
      const c = polygon[index + 2];
      return area + ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    }, 0);
  }, 0);
}

function roundingArea(polygons: Polygon[]): number {
  return polygons.reduce((sum, polygon) => sum + Number.EPSILON * 64 * polygon.length
    * Math.max(1, ...polygon.flat().map(value => value * value)), 0);
}

function verify(input: PavingInput, output: PavingOutput): void {
  const target = (sources: GroundSurface[]) => sources.filter(source => source.surface === 'curb' || source.surface === 'sidewalk').map(source => source.polygon);
  const source = target(input.ground), result = target(output.ground);
  // Each source already passed the exact incidence/coverage certificate in plan().
  // This independent adapter check measures emitted numbers without resnapping them.
  expect(Math.abs(surfaceArea(source) - surfaceArea(result))).toBeLessThanOrEqual(roundingArea([...source, ...result]));
  const frames = new Map(output.construction.frames.map(frame => [frame.id, frame]));
  const regions = new Map(output.construction.regions.map(region => [region.id, region]));
  expect(frames.size).toBe(output.construction.frames.length);
  expect(regions.size).toBe(output.construction.regions.length);
  expect(output.construction.version).toBe('1.1.0');
  if (output.construction.version === '1.1.0') {
    expect(output.construction.roadwayLayoutId).toBe(input.design.roadwayLayoutId ?? input.design.defaultLayoutId);
  }
  const sources = output.construction.version === '1.1.0' ? new Map(output.construction.sources.map(source => [source.id, source])) : new Map();
  for (const frame of frames.values()) expect(Math.hypot(...frame.u)).toBeCloseTo(1, 12);
  for (const owner of output.ground) {
    if (!owner.construction) continue;
    expect(owner.bottom).toBe(0);
    expect(owner.top).toBe(0.15);
    const region = regions.get(owner.construction.regionId)!;
    expect(sources.get(region.sourceId)).toEqual({ id: region.sourceId, surface: owner.surface, bottom: owner.bottom, top: owner.top });
    const frame = frames.get(region.frameId)!;
    const layout = output.construction.layouts.find(layout => layout.id === region.layoutId)!;
    const part = owner.construction.part;
    if (part.kind === 'grid') {
      const module = layout.modules.find(module => module.id === part.moduleId)!;
      const cells = part.cells.flatMap(span => Array.from({ length: span.to - span.from }, (_, index) => footprint(frame, module, span.from + index, span.row)));
      expect(difference([owner.polygon], cells)).toEqual([]);
      expect(difference(cells, [owner.polygon])).toEqual([]);
      for (let i = 0; i < part.cells.length; i++) {
        const span = part.cells[i];
        expect([span.row, span.from, span.to].every(Number.isInteger)).toBe(true);
        expect(span.to).toBeGreaterThan(span.from);
        if (i) expect(span.row > part.cells[i - 1].row || span.from >= part.cells[i - 1].to).toBe(true);
      }
    }
  }
}

function published(source: PavingInput): PublishedPavingInput {
  const output = PavingPlanner.plan(source);
  return { meta: { boundary: rect(0, -3.5, 24, 10) },
    streets: { ...source.streets, construction: { ...source.streets.construction, paving: output.construction } },
    volumetric: { ground: output.ground }, transit: { trainStations: [], subwayStations: [] } };
}

function shared(source: PavingInput, boundary: Polygon): SharedPavingInput {
  const partition = SourcePartition.create({ id: 'city', source: boundary, coordinateScale: 1000 });
  const owners = source.ground.map((owner, index) => ({ ownerId: `ground:${index}`,
    surface: owner.surface, bottom: owner.bottom, top: owner.top }));
  partition.divide('city', { claims: owners.map((owner, index) => ({ id: owner.ownerId, masks: [source.ground[index].polygon] })),
    remainderId: 'fringe' });
  owners.push({ ownerId: 'fringe', surface: 'open', bottom: 0, top: 0.15 });
  return { streets: source.streets, design: source.design, districts: source.districts, stationBays: source.stationBays,
    groundSource: { partition, boundary, coordinateScale: 1000, owners, excludedOwnerIds: [] } };
}

/** One walking band of the requested width, published from the shared entry as whole rows. */
function wholeWidthCity(width: number): PublishedPavingInput {
  const nodes: StreetNode[] = [[0, 0], [12, 0]].map((position, index) => ({ id: `n${index}`,
    position: position as Vec2, edgeIds: ['e0'], connections: [{ level: 0, edgeIds: ['e0'] }] }));
  const edge: StreetEdge = { id: 'e0', from: 'n0', to: 'n1', path: nodes.map(node => node.position),
    class: 'street', width: 7, sidewalk: { left: 0, right: 0 }, districtIds: [], level: 0,
    elevationProfile: [{ distance: 0, level: 0 }, { distance: 12, level: 0 }] };
  const planned = StreetSections.plan([edge], nodes, legacyStreetDesign({
    curb: 0.15, border: 0, furnishing: 0, walking: width, frontage: 0 }), () => 'downtown');
  const boundary = rect(0, 3.65, 12, 3.65 + width);
  const request: SharedPavingInput = {
    streets: { nodes, edges: planned.edges, crossings: [], construction: { version: '1.0.0', runs: planned.runs } },
    districts: [], design: { defaultLayoutId: 'panels', districtLayouts: [], layouts: [{ id: 'panels', familyId: 'concrete',
      modules: [{ id: 'base', pitch: [1, 1], joint: [0.012, 0.012] },
        { id: 'group', pitch: [2, 2], baseCells: [2, 2], joint: [0.012, 0.012] }],
      bands: { curb: { moduleId: 'base', borderWidth: 0 }, border: { moduleId: 'base', borderWidth: 0 },
        furnishing: { moduleId: 'base', borderWidth: 0 }, frontage: { moduleId: 'base', borderWidth: 0 },
        walking: { moduleId: 'base', borderWidth: 0, grouping: { moduleId: 'group', period: [2, 4], offset: [0, 1] } } } }] },
    groundSource: {
      partition: SourcePartition.create({ id: 'walking', source: boundary, coordinateScale: 1000 }),
      boundary, coordinateScale: 1000, excludedOwnerIds: [],
      owners: [{ ownerId: 'walking', surface: 'sidewalk', bottom: 0, top: 0.2 }],
    } };
  const output = PavingPlanner.planShared(request);
  return { meta: { boundary }, streets: { ...request.streets, construction: { ...request.streets.construction, paving: output.construction } },
    volumetric: { ground: output.ground }, transit: { trainStations: [], subwayStations: [] } };
}

// Independent public-coordinate expansion preserves group interiors as one slab.
function slabs(ground: GroundSurface[], modules: PavingModule[]) {
  return ground.flatMap(owner => {
    const part = owner.construction!.part;
    if (part.kind !== 'grid') return [];
    const module = modules.find(module => module.id === part.moduleId)!;
    const count = module.baseCells ?? [1, 1], offset = part.baseOffset ?? [0, 0];
    return part.cells.flatMap(span => Array.from({ length: span.to - span.from }, (_, index) => {
      const column = span.from + index;
      return { module, local: [
        (column * count[0] + offset[0]) * module.pitch[0] / count[0],
        (span.row * count[1] + offset[1]) * module.pitch[1] / count[1],
      ] as Vec2 };
    }));
  });
}

describe('fitted paving producer contract', () => {
  it('validates owned parameter settings and reports malformed or incoherent input', () => {
    const request = design();
    request.districtLayouts = [{ districtId: 'future-district', layoutId: 'fitted' }];
    const result = PavingPlanner.validateDesign(request);
    expect(result).toEqual(request);
    request.layouts[0].modules[0].pitch[0] = 90;
    request.layouts[0].bands.walking.borderWidth = 90;
    request.districtLayouts[0].districtId = 'changed';
    expect(result.layouts[0].modules[0].pitch[0]).toBe(2);
    expect(result.layouts[0].bands.walking.borderWidth).toBe(0.05);
    expect(result.districtLayouts[0].districtId).toBe('future-district');
    expect(() => PavingPlanner.validateDesign(undefined)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    const roadway = design(); roadway.roadwayLayoutId = 'missing';
    expect(() => PavingPlanner.validateDesign(roadway)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    const grouping = groupedDesign();
    grouping.layouts[0].bands.walking.grouping!.period[0] = 3;
    expect(() => PavingPlanner.validateDesign(grouping)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));

    const malformed = input();
    malformed.design.layouts[0].modules[0].joint[0] = 2;
    expect(() => PavingPlanner.plan(malformed)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    const broken = input(); broken.streets.construction.runs[0].edges[0].edgeId = 'missing';
    expect(() => PavingPlanner.plan(broken)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    const repeated = input(); repeated.ground = PavingPlanner.plan(repeated).ground;
    expect(() => PavingPlanner.plan(repeated)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));

    const boundary = rect(0, -3.5, 24, 10);
    const unknownOwner = shared(input(), boundary);
    unknownOwner.groundSource.owners[0].ownerId = 'unknown';
    expect(() => PavingPlanner.planShared(unknownOwner)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    const offGrid = shared(input(), boundary);
    offGrid.districts[0].boundary[0][0] += 0.0001;
    expect(() => PavingPlanner.planShared(offGrid)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));

    const explicit = input();
    const planned = StreetSections.plan(explicit.streets.edges, explicit.streets.nodes, resolveStreetDesign(), () => 'downtown');
    explicit.streets.edges = planned.edges;
    explicit.streets.construction.runs = planned.runs;
    const unsupported = { code: 'E_INVARIANT',
      message: 'fitted paving requires curb-only street sections without module construction' };
    expect(() => PavingPlanner.plan(explicit)).toThrowError(expect.objectContaining(unsupported));
    expect(() => PavingPlanner.planShared(shared(explicit, boundary))).toThrowError(expect.objectContaining(unsupported));
  });

  it('fits whole cells, shared curb stations, district finishes and junction circulation', () => {
    const source = input();
    const second = structuredClone(source.design.layouts[0]);
    second.id = 'salvage'; second.familyId = 'salvaged';
    source.design.layouts.push(second);
    source.design.roadwayLayoutId = second.id;
    source.districts = [{ id: 'd0', boundary: rect(-100, -100, 12, 100) }, { id: 'd1', boundary: rect(12, -100, 100, 100) }];
    source.design.districtLayouts = [{ districtId: 'd1', layoutId: 'salvage' }];
    const output = PavingPlanner.plan(source);
    verify(source, output);
    expect(output.ground.find(owner => owner.surface === 'roadway')).toBe(source.ground[2]);
    expect(output.ground.some(owner => owner.construction?.part.kind === 'grid'
      && output.construction.regions.find(region => region.id === owner.construction!.regionId)?.band === 'walking')).toBe(true);
    expect(output.ground.some(owner => owner.construction?.part.kind === 'solid' && owner.construction.part.role === 'border')).toBe(true);
    expect(new Set(output.construction.regions.map(region => region.layoutId))).toEqual(new Set(['fitted', 'salvage']));
    expect(output.construction.regions.filter(region => region.owner.kind === 'run').every(region => region.owner.kind === 'run'
      && region.owner.side === 'left' && region.owner.station[0] === 0 && region.owner.station[1] === 24)).toBe(true);
    expect(output.construction.frames.every(frame => frame.origin[0] === 0 && frame.u[0] === 1 && frame.u[1] === 0)).toBe(true);
    expect(PavingPlanner.plan(source)).toEqual(output);
    const split = input([[[0, 0], [12, 0]], [[24, 0], [12, 0]]]);
    const splitOutput = PavingPlanner.plan(split);
    verify(split, splitOutput);
    expect(splitOutput.construction.regions.some(region => region.owner.kind === 'run'
      && region.owner.edgeId === 'e1' && region.owner.side === 'right' && region.owner.station[0] === 12 && region.owner.station[1] === 24)).toBe(true);

    const junction = input([[[0, 0], [15, 0]], [[15, 0], [25, 6]], [[15, -20], [15, 0]], [[15, 0], [15, 20]]]);
    junction.ground = union(junction.streets.edges.flatMap(edge =>
      [...StreetCorridors.sidewalk(edge, 'left'), ...StreetCorridors.sidewalk(edge, 'right')])).map(polygon => ground(polygon));
    junction.stationBays = [{ stationId: 'ss0', entranceIndex: 0, footprint: rect(4, 5, 8, 9) }];
    const node = junction.streets.nodes.find(node => node.position[0] === 15 && node.position[1] === 0)!;
    junction.streets.crossings = [{ nodeId: node.id, segments: [{ edgeId: 'e3', from: [9, 6], to: [21, 6], width: 3, markings: [] }] }];
    const junctionOutput = PavingPlanner.plan(junction);
    verify(junction, junctionOutput);
    expect(junctionOutput.ground.some(owner => owner.construction?.part.kind === 'solid'
      && owner.construction.part.role === 'crossing-field')).toBe(true);
    expect(junctionOutput.construction.frames.some(frame => frame.u[0] !== 0 && frame.u[0] !== 1)).toBe(true);
    const stationRegions = junctionOutput.construction.regions.filter(region => region.owner.kind === 'station-bay');
    expect(stationRegions.length).toBeGreaterThan(0);
    expect(stationRegions.every(region => region.band === 'circulation' && region.owner.kind === 'station-bay'
      && region.owner.stationId === 'ss0' && region.owner.entranceIndex === 0)).toBe(true);
  });

  it('continues metre joints through a rotated curb and refines retained owners after a snapshot', () => {
    const at = (u: number, v: number): Vec2 => [10 + 0.6 * u - 0.8 * v, 20 + 0.8 * u + 0.6 * v];
    const source = input([[at(0, 0), at(24, 0)]]);
    source.design = groupedDesign();
    const curb = [at(0, 3.5), at(24, 3.5), at(24, 3.649), at(0, 3.649)]
      .map(point => point.map(value => Math.round(value * 1000) / 1000) as Vec2);
    source.ground = [ground(curb, 'curb')];
    for (const [entry, output] of [['shared', PavingPlanner.planShared(shared(source, curb))], ['standalone', PavingPlanner.plan(source)]] as const) {
      verify(source, output);
      const joints = output.ground.filter(owner => owner.construction?.part.kind === 'solid'
        && owner.construction.part.role === 'joint');
      for (let station = 1; station < 24; station++) {
        for (const across of [3.51, 3.575, 3.639]) {
          expect(joints.some(owner => pointInPolygon(at(station, across), owner.polygon)), `joint ${station}, width ${across}`).toBe(true);
          expect(joints.some(owner => pointInPolygon(at(station + 0.02, across), owner.polygon))).toBe(false);
        }
      }
      if (entry === 'shared') PavingPlanner.validatePublished(JSON.parse(JSON.stringify({
        meta: { boundary: curb }, streets: { ...source.streets, construction: { ...source.streets.construction, paving: output.construction } },
        volumetric: { ground: output.ground }, transit: { trainStations: [], subwayStations: [] },
      })));
    }
    const curbModule = source.design.layouts[0].modules.find(module => module.id === 'kerb')!;
    curbModule.pitch[0] = 2;
    curbModule.baseCells = [2, 1];
    const paired = PavingPlanner.planShared(shared(source, curb));
    const pairedJoints = paired.ground.filter(owner => owner.construction?.part.kind === 'solid'
      && owner.construction.part.role === 'joint');
    for (let station = 1; station < 24; station++) {
      expect(pairedJoints.some(owner => pointInPolygon(at(station, 3.575), owner.polygon))).toBe(station % 2 === 0);
    }
    source.design.layouts[0].modules.forEach(module => { module.joint[0] = 0; });
    expect(PavingPlanner.plan(source).ground.some(owner => owner.construction?.part.kind === 'solid'
      && owner.construction.part.role === 'joint')).toBe(false);

    const refined = input(), boundary = rect(0, -3.5, 24, 10), water = rect(10, 1, 12, 2);
    const request = shared(refined, boundary);
    const { partition, owners } = request.groundSource;
    partition.divide('ground:2', { claims: [{ id: 'water', masks: [water] }], remainderId: 'dry-road' });
    owners.find(owner => owner.ownerId === 'ground:2')!.ownerId = 'dry-road';
    request.groundSource.excludedOwnerIds = ['water'];
    const distance = 5.623456789, construction = CrossingPlanner.construction(refined.streets.edges[0], { distance });
    const field = edgeMaskView({ mask: construction.field, encoding: 'authored-1mm' });
    const landings = { left: edgeMaskView({ mask: construction.landings.left, encoding: 'authored-1mm' }),
      right: edgeMaskView({ mask: construction.landings.right, encoding: 'authored-1mm' }) };
    const walkingLandings = { left: edgeMaskView({ mask: construction.walkingLandings.left, encoding: 'authored-1mm' }),
      right: edgeMaskView({ mask: construction.walkingLandings.right, encoding: 'authored-1mm' }) };
    const approach = { groupId: 'n0:connection:0', nodeId: 'n0', edgeId: 'e0', distance,
      station: [distance - 1.5, distance + 1.5] as [number, number], field, landings, walkingLandings,
      cut: { left: field[3], right: field[0] } };
    refined.streets.construction.junctions = [{ id: 'j0', groupIds: ['n0:connection:0'], nodeIds: ['n0'], internalEdgeIds: [], approaches: [approach] }];
    const authored = structuredClone(approach);
    partition.finish();
    const output = PavingPlanner.planShared(request);
    expect(approach).toEqual(authored);
    expect(output.ground.some(owner => owner.polygon.some(point => point[0] === landings.left[0][0]))).toBe(true);
    expect(output.ground.some(owner => owner.construction?.part.kind === 'solid' && owner.construction.part.role === 'approach')).toBe(true);
    PavingPlanner.validatePublished(JSON.parse(JSON.stringify({ meta: { boundary },
      streets: { ...refined.streets, construction: { ...refined.streets.construction, paving: output.construction } },
      volumetric: { ground: output.ground }, hydrology: { bodies: [{ surfaces: [water] }] },
      transit: { trainStations: [], subwayStations: [] } })));
    const mismatched = shared(input(), boundary);
    mismatched.streets.construction.junctions = structuredClone(refined.streets.construction.junctions);
    mismatched.streets.construction.junctions![0].approaches[0].landings.left[0][0] += 0.001;
    expect(() => PavingPlanner.planShared(mismatched)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });

  it('expands integer groups and whole-width base offsets over the shared base lattice', () => {
    const angle = 0.37;
    const rotate = ([x, z]: Vec2): Vec2 => [Math.round((x * Math.cos(angle) - z * Math.sin(angle)) * 1000) / 1000,
      Math.round((x * Math.sin(angle) + z * Math.cos(angle)) * 1000) / 1000];
    const source = input([[[0, 0], rotate([24, 0])]]);
    source.ground = source.ground.map(owner => ({ ...owner, polygon: owner.polygon.map(rotate) }));
    source.design = groupedDesign();
    const boundary = rect(0, -3.5, 24, 10).map(rotate);
    const request = shared(source, boundary);
    expect(request.groundSource.partition.finish().pieces.length).toBeGreaterThan(0);
    const output = PavingPlanner.planShared(request);
    PavingPlanner.validatePublished(JSON.parse(JSON.stringify({ meta: { boundary },
      streets: { ...source.streets, construction: { ...source.streets.construction, paving: output.construction } },
      volumetric: { ground: output.ground }, transit: { trainStations: [], subwayStations: [] } })));
    const grids = output.ground.filter(owner => owner.construction?.part.kind === 'grid');
    expect(grids.some(owner => owner.construction?.part.kind === 'grid' && owner.construction.part.moduleId === 'large')).toBe(true);
    expect(grids.some(owner => owner.construction?.part.kind === 'grid' && owner.construction.part.moduleId === 'slab')).toBe(true);
    for (const owner of grids) {
      const part = owner.construction!.part;
      if (part.kind === 'grid' && part.moduleId === 'large') {
        expect(owner.polygon.length).toBeGreaterThanOrEqual(8);
        expect(part.cells.every(span => span.from % 2 === 0 && span.to === span.from + 1)).toBe(true);
      }
    }

    const city = wholeWidthCity(4);
    PavingPlanner.validatePublished(JSON.parse(JSON.stringify(city)));
    const paving = city.streets.construction!.paving!;
    expect(paving.version).toBe('1.2.0');
    expect(paving.regions).toHaveLength(1);
    expect(paving.regions[0].band).toBe('walking');
    expect(city.volumetric.ground.every(owner => owner.construction?.part.kind === 'grid')).toBe(true);
    const expanded = slabs(city.volumetric.ground, paving.layouts[0].modules);
    const firstColumn = expanded.filter(slab => slab.local[0] === 0).sort((a, b) => a.local[1] - b.local[1]);
    expect(firstColumn.map(slab => slab.module.pitch[1])).toEqual([1, 2, 1]);
    expect(firstColumn.map(slab => slab.local[1])).toEqual([0, 1, 3]);
    expect(expanded.filter(slab => slab.module.id === 'group')).toHaveLength(6);
    const grouped = city.volumetric.ground.find(owner => owner.construction!.part.kind === 'grid'
      && owner.construction!.part.moduleId === 'group')!;
    const bases = city.volumetric.ground.filter(owner => owner !== grouped);
    expect(grouped.polygon.filter(point => bases.some(base =>
      base.polygon.some(other => other[0] === point[0] && other[1] === point[1])))).toHaveLength(26);
  });

  it('validates saved fitted owners against the independent city domain, water and group offsets', () => {
    const water = rect(10, 1, 12, 2);
    const holed = (fill: GroundSurface[]) => {
      const source = input();
      source.ground.splice(2, 1, ...[
        rect(0, -3.5, 10, 3.5), rect(12, -3.5, 24, 3.5), rect(10, -3.5, 12, 1), rect(10, 2, 12, 3.5),
      ].map(polygon => ground(polygon, 'roadway')), ...fill);
      return source;
    };
    const flooded = published(holed([]));
    flooded.hydrology = { bodies: [{ surfaces: [water] }] };
    PavingPlanner.validatePublished(JSON.parse(JSON.stringify(flooded)));
    const missingWater = structuredClone(flooded);
    delete missingWater.hydrology;
    expect(() => PavingPlanner.validatePublished(missingWater)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    const saved = JSON.parse(JSON.stringify(published(holed([ground(water, 'open')])))) as PublishedPavingInput;
    PavingPlanner.validatePublished(structuredClone(saved));
    const cases: [string, (city: PublishedPavingInput) => void][] = [
      ['missing outer owner', city => { city.volumetric.ground.splice(city.volumetric.ground.findIndex(owner => owner.surface === 'roadway'), 1); }],
      ['missing internal owner', city => { city.volumetric.ground.splice(city.volumetric.ground.findIndex(owner => owner.surface === 'open'), 1); }],
      ['duplicate owner', city => { city.volumetric.ground.push(structuredClone(city.volumetric.ground.find(owner => owner.surface === 'open')!)); }],
      ['moved shared vertex', city => { city.volumetric.ground.find(owner => owner.surface === 'open')!.polygon[0][0] += 0.001; }],
      ['wrong source role', city => { city.volumetric.ground.find(owner => owner.surface === 'curb')!.surface = 'sidewalk'; }],
      ['wrong source level', city => { city.volumetric.ground.find(owner => owner.surface === 'curb')!.top += 0.01; }],
      ['invalid spans', city => {
        const part = city.volumetric.ground.find(owner => owner.construction?.part.kind === 'grid')!.construction!.part;
        if (part.kind === 'grid') part.cells[0].row += 0.5;
      }],
      ['moved frame', city => { city.streets.construction!.paving!.frames[0].origin[0] += 0.01; }],
      ['unknown source', city => { city.streets.construction!.paving!.regions[0].sourceId = 'missing'; }],
      ['legacy fitted format', city => { city.streets.construction!.paving!.version = '1.0.0'; }],
      ['missing roadway layout', city => {
        const paving = city.streets.construction!.paving!;
        if (paving.version === '1.1.0') paving.roadwayLayoutId = 'missing';
      }],
    ];
    for (const [name, corrupt] of cases) {
      const changed = structuredClone(saved);
      corrupt(changed);
      expect(() => PavingPlanner.validatePublished(changed), name).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    }

    const city = wholeWidthCity(4);
    for (const offset of [undefined, [0, 0], [0, 0.5], [0, 3]]) {
      const changed = structuredClone(city);
      const part = changed.volumetric.ground.find(owner => owner.construction!.part.kind === 'grid'
        && owner.construction!.part.moduleId === 'group')!.construction!.part;
      if (part.kind === 'grid') part.baseOffset = offset as [number, number] | undefined;
      expect(() => PavingPlanner.validatePublished(changed)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    }
    city.streets.construction!.paving!.version = '1.1.0';
    expect(() => PavingPlanner.validatePublished(city)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });
});
