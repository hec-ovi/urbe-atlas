import { expect, it } from 'vitest';
import { GridLayout } from './GridLayout';
import { LayoutCandidates } from './LayoutCandidates';
import { LayoutPlanning } from './LayoutPlanning';
import { AvenueMedians } from './medians/AvenueMedians';
import { StreetReservations } from './reservations/StreetReservations';
import { HighwayUnderpasses } from './underpasses/HighwayUnderpasses';
import { resolveStreetDesign } from '../construction/Design';
import { districtStreetDesign } from '../construction/DistrictDesign';
import { applyHighwayElevationProfiles } from '../construction/highway';
import { ModuleGround } from '../construction/modules/ModuleGround';
import { difference, intersection, union } from '../../geom/clip';
import { area } from '../../geom/polygon';
import { length } from '../../geom/polyline';
import type { ModuleFormat } from '../construction/modules/schema';
import type { GridLayoutInput, GridLayoutPlan } from './schema';
import type { ReservationInput } from './reservations/schema';
import type { Polygon, Vec2 } from '../../../schema/blueprint';

const sourceDesign = resolveStreetDesign();
const districtDesign = districtStreetDesign();
const sum = (rings: Polygon[]) => rings.reduce((value, ring) => value + area(ring), 0);

const input: GridLayoutInput = {
  seed: 'modules', diagonals: 'off', size: { width: 1000, depth: 800 },
  profiles: [1, 2, 4].map(count => ({ id: `lanes:${count}`, classes: [count === 4 ? 'road' : 'street'],
    lanes: Array.from({ length: count }, (_, i) => ({ width: 3.5, direction: i < count / 2 ? 'forward' : 'backward' })),
    shoulders: { left: 0, right: 0 } })),
  sideAt: (point, kind) => ({ finish: 'maintained', profile: {
    id: kind === 'road' ? 'wide' : point[0] < 500 ? 'normal' : 'narrow',
    curb: 0.2, border: kind === 'road' ? 1 : 0, furnishing: kind === 'road' ? 1 : 0,
    walking: kind === 'road' ? 3 : point[0] < 500 ? 4 : 2, frontage: kind === 'road' ? 1 : 0,
    edge: { curbRise: 0.2, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' } } },
  } }),
};
const districtInput: GridLayoutInput = { seed: 'district-review', moduleFormat: 'district', size: { width: 800, depth: 800 },
  profiles: districtDesign.profiles, highway: true, diagonals: 'off', districtCenters: [[400, 400]],
  sideAt: ([x, z]) => ({ profile: districtDesign.sidewalkProfiles[0], finish: x + z < 800 ? 'luxury-blue' : 'luxury-red' }),
  perimeter: { profile: districtDesign.sidewalkProfiles[0], finish: 'luxury-red' } };
const candidateInput: GridLayoutInput = { seed: 'urbe', size: { width: 1000, depth: 1000 }, profiles: sourceDesign.profiles,
  highway: true, sideAt: () => ({ profile: sourceDesign.sidewalkProfiles[2], finish: 'plain' }) };

const grid = GridLayout.plan(input);

function reservationInput(plan: GridLayoutPlan): ReservationInput {
  return {
    planning: plan.planning, layoutBlocks: plan.blocks, modules: plan.modules,
    streets: { nodes: plan.nodes, edges: plan.edges, highwayStructures: [] },
    blocks: plan.blocks.map(block => ({ id: block.id, parcelIds: [`parcel:${block.id}`] })),
    parcels: plan.blocks.map(block => ({ id: `parcel:${block.id}`, lot: block.interior })),
    transit: { subwayStations: [] }, volumetric: { ground: [
      ...ModuleGround.cover(plan.modules).map(({ blockId, ...ground }) => ({ ...ground, moduleBlockId: blockId })),
      ...plan.roadway.map(polygon => ({ surface: 'roadway' as const, polygon, bottom: -0.2, top: 0 })),
    ] },
  };
}

/** A plan whose reserved run is published as the elevated highway, ready for its underpasses. */
function highwayPlan(format: ModuleFormat): GridLayoutPlan {
  const design = format === 'district' ? districtDesign : sourceDesign;
  const plan = GridLayout.plan({ seed: 'underpass-supports', size: { width: 800, depth: 800 },
    moduleFormat: format, profiles: design.profiles, highway: true, diagonals: 'off',
    sideAt: () => ({ profile: design.sidewalkProfiles[format === 'district' ? 0 : 2], finish: 'maintained' }) });
  const highway = new Set(plan.runs.find(run => run.id === plan.highwayRunId)!.edges.map(edge => edge.edgeId));
  for (const edge of plan.edges) if (highway.has(edge.id)) {
    edge.class = 'highway'; edge.level = 8; edge.sidewalk = { left: 0, right: 0 };
    delete edge.crossSection;
  }
  applyHighwayElevationProfiles(plan.edges);
  return plan;
}
const cityLand: Polygon = [[0, 0], [800, 0], [800, 800], [0, 800]];
const groundOf = (plan: GridLayoutPlan) => [...ModuleGround.cover(plan.modules).map(region => region.polygon), ...plan.roadway];

it('connects whole-panel blocks through one street graph and covers its rectangle exactly', () => {
  expect(GridLayout.plan(input)).toEqual(grid);
  expect(GridLayout.plan({ ...input, seed: 'other' })).not.toEqual(grid);
  expect(grid.highwayRunId).toBeUndefined();
  const nodes = new Map(grid.nodes.map(node => [node.id, node]));
  const edges = new Map(grid.edges.map(edge => [edge.id, edge]));
  const supportIds = new Set(grid.planning.corners.map(corner => corner.id));
  for (const frontage of grid.planning.frontages) {
    expect(frontage.edgeIds.every(id => edges.has(id))).toBe(true);
    expect(frontage.cornerIds.every(id => id === null || supportIds.has(id))).toBe(true);
    expect(grid.blocks.some(block => block.id === frontage.ownerId)).toBe(true);
  }
  const visited = new Set<string>();
  const pending = [grid.nodes[0].id];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const edgeId of nodes.get(id)!.edgeIds) {
      const edge = edges.get(edgeId)!;
      pending.push(edge.from === id ? edge.to : edge.from);
    }
  }
  expect(visited.size).toBe(grid.nodes.length);
  expect(new Set(grid.edges.map(edge => edge.crossSection!.lanes.length))).toEqual(new Set([1, 2, 4]));
  for (const edge of grid.edges) {
    expect(edge.path).toEqual([nodes.get(edge.from)!.position, nodes.get(edge.to)!.position]);
    expect(edge.path[0][0] === edge.path[1][0] || edge.path[0][1] === edge.path[1][1]).toBe(true);
    expect(edge.sidewalk.left).toBe(edge.crossSection!.sidewalks.left.geometry!.pavedWidth + 0.5);
  }
  const shape = (block: GridLayoutPlan['blocks'][number]) =>
    [block.outer[1][0] - block.outer[0][0] - 1, block.outer[2][1] - block.outer[1][1] - 1];
  for (const block of grid.blocks) {
    expect(block.edgeIds.every(id => edges.has(id))).toBe(true);
    expect(shape(block).every(span => span % 2 === 0)).toBe(true);
  }
  expect(grid.blocks.some(block => Math.max(...shape(block)) / Math.min(...shape(block)) >= 1.5)).toBe(true);
  const rectangles = [...grid.roadway, ...grid.blocks.map(block => block.outer)];
  expect(sum(rectangles)).toBeCloseTo((grid.bounds.max[0] - grid.bounds.min[0]) * (grid.bounds.max[1] - grid.bounds.min[1]), 8);
  for (let i = 0; i < rectangles.length; i++) for (let j = i + 1; j < rectangles.length; j++) {
    const a = rectangles[i], b = rectangles[j];
    expect(a[2][0] <= b[0][0] || b[2][0] <= a[0][0] || a[2][1] <= b[0][1] || b[2][1] <= a[0][1]).toBe(true);
  }
  expect(grid.bounds.min.every(value => value > 0)).toBe(true);
  expect(grid.bounds.max[0]).toBeLessThan(input.size.width);
  expect(grid.bounds.max[1]).toBeLessThan(input.size.depth);

  const planning = structuredClone(grid.planning), ownerId = grid.blocks[1].id;
  const owned = structuredClone(planning.frontages.filter(frontage => frontage.ownerId === ownerId));
  LayoutPlanning.retain(planning, new Map([[ownerId, 'retained']]));
  expect(planning.frontages).toEqual(owned.map(frontage => ({ ...frontage, ownerId: 'retained' })));
  expect(planning.corners.every(corner => corner.ownerId === 'retained')).toBe(true);
  const corners = new Set(planning.corners.map(corner => corner.id));
  expect(planning.frontages.every(frontage => frontage.cornerIds.every(id => id === null || corners.has(id)))).toBe(true);
});

it('repeats catalog pieces and places sparse parking and rails on their cleared frontages', () => {
  const parking = grid.modules.parking!;
  expect(parking.length).toBeGreaterThan(0);
  expect(parking.length).toBeLessThan(grid.blocks.length / 3);
  expect(new Set(parking.map(bay => bay.blockId)).size).toBe(parking.length);
  const ground = ModuleGround.cover(grid.modules);
  for (const bay of parking) {
    expect(bay.start % 2).toBe(0);
    expect(bay.start).toBeGreaterThanOrEqual(8);
    expect(bay.slots.map(area)).toEqual(Array(bay.slotCount).fill(15));
    expect(bay.profile).toBe('native');
    if (bay.profile !== 'native') continue;
    expect(bay.walkingClearance).toBeGreaterThanOrEqual(3.5);
    const face = grid.planning.frontages.find(frontage => frontage.id === bay.frontageId)!;
    const edge = grid.edges.find(edge => face.edgeIds.includes(edge.id))!;
    const side = edge.crossSection!.sidewalks[bay.side < 2 ? 'left' : 'right'];
    const walking = side.geometry!.intervals.find(interval => interval.role === 'walking')!;
    expect([walking.start, walking.end, side.bands.walking]).toEqual([3, 6.5, 3.5]);
    const at = (point: Vec2, offset: number): Vec2 => [point[0] + face.inward[0] * offset, point[1] + face.inward[1] * offset];
    const [a, b] = bay.footprint;
    const strip = [at(a, walking.start), at(b, walking.start), at(b, walking.end), at(a, walking.end)];
    const paved = ground.filter(field => field.blockId === bay.blockId && field.surface === 'sidewalk').map(field => field.polygon);
    expect(difference([strip], paved)).toEqual([]);
  }
  const rails = grid.modules.placements.filter(placement => placement.moduleId === 'guardrail:2');
  const railBlocks = new Set(rails.map(rail => rail.blockId));
  expect(railBlocks.size).toBeGreaterThan(1);
  expect(rails.length).toBeLessThan(grid.blocks.length);
  expect(rails.every(rail => rail.count >= 1 && rail.count <= 3)).toBe(true);
  for (const blockId of railBlocks) expect(rails.filter(rail => rail.blockId === blockId).length).toBeLessThanOrEqual(2);
  const definitions = new Set(grid.modules.definitions.map(definition => definition.id));
  expect(grid.modules.placements.every(placement => definitions.has(placement.moduleId))).toBe(true);
  expect(grid.modules.placements.reduce((total, placement) => total + placement.count, 0)).toBeGreaterThan(definitions.size * 100);

  const wideWalking = GridLayout.plan({ ...input, sideAt: (point, kind) => {
    const side = input.sideAt(point, kind);
    if (kind === 'road') side.profile = { ...side.profile, border: 0, furnishing: 0, walking: 6, frontage: 0 };
    return side;
  } });
  expect(wideWalking.modules.parking ?? []).toEqual([]);
});

it('rejects unusable profiles, sizes, diagonal modes and district centers', () => {
  const narrow = () => {
    const side = input.sideAt([0, 0], 'street');
    return { ...side, profile: { ...side.profile, walking: 3 } };
  };
  const rejected: [GridLayoutInput, RegExp | { code: string }][] = [
    [{ ...input, size: { width: 100, depth: 800 } }, /cannot fit/],
    [{ ...input, profiles: [] }, /road profiles/],
    [{ ...input, highway: 'yes' as unknown as boolean }, /highway must be boolean/],
    [{ ...input, sideAt: narrow }, /2\/4\/6/],
    [{ ...input, diagonals: 'bad' as 'off' }, { code: 'E_INVALID_PARAMS' }],
    [{ ...input, diagonalCornerClearance: NaN }, { code: 'E_INVALID_PARAMS' }],
    [{ ...districtInput, diagonals: 'legacy-applied' }, { code: 'E_INVALID_PARAMS' }],
    [{ ...districtInput, districtCenters: [[NaN, 0]] }, { code: 'E_INVALID_PARAMS' }],
  ];
  for (const [settings, expected] of rejected) {
    expect(() => GridLayout.plan(settings))
      .toThrowError(expected instanceof RegExp ? expected : expect.objectContaining(expected));
  }
});

it('reserves district blocks, one interior highway run, avenue medians and district parking', () => {
  const plan = GridLayout.plan(districtInput);
  expect(GridLayout.plan(districtInput)).toEqual(plan);
  const run = plan.runs.find(value => value.id === plan.highwayRunId)!;
  expect(run).toBeDefined();
  const along = run.path[0][0] === run.path.at(-1)![0] ? 1 : 0, across = 1 - along;
  const position = run.path[0][across];
  const stations = plan.nodes.map(node => node.position[along]);
  expect(run.path.map(point => point[along])).toEqual([Math.min(...stations), Math.max(...stations)]);
  expect(plan.blocks.some(block => block.outer.every(point => point[across] <= position - 7))).toBe(true);
  expect(plan.blocks.some(block => block.outer.every(point => point[across] >= position + 7))).toBe(true);
  const highwayEdges = new Set(run.edges.map(member => member.edgeId));
  for (const edge of plan.edges.filter(edge => highwayEdges.has(edge.id))) {
    expect(edge.crossSection!.lanes).toHaveLength(4);
    expect(edge.crossSection!.median).toBeUndefined();
  }
  const reservedRuns = new Set(plan.edges.filter(edge => edge.crossSection?.median).map(edge => edge.crossSection!.runId));
  expect(reservedRuns.size).toBe(1);
  expect(plan.edges.some(edge => edge.class === 'road' && !edge.crossSection?.median)).toBe(true);
  for (const block of plan.blocks) {
    const fronts = plan.planning.frontages.filter(front => front.ownerId === block.id);
    expect(fronts).toHaveLength(4);
    expect(fronts.every(front => front.pavedWidth === 4.2 && front.gutterWidth === 0.5)).toBe(true);
    expect(new Set(plan.modules.placements.filter(item => item.blockId === block.id).map(item => item.finish)).size).toBe(1);
  }

  const original = structuredClone(plan), islands = AvenueMedians.build(plan);
  expect(plan).toEqual(original);
  expect(AvenueMedians.build(plan)).toEqual(islands);
  expect(islands.medians.length).toBeGreaterThan(0);
  const cover = ModuleGround.cover({ version: '1.0.0', format: 'district',
    definitions: islands.definitions, placements: islands.placements });
  for (const median of islands.medians) {
    const fields = cover.filter(field => field.blockId === median.id).map(field => field.polygon);
    expect(sum(fields)).toBeCloseTo(area(median.footprint), 7);
    expect(sum(union(fields))).toBeCloseTo(sum(fields), 7);
    expect(difference(fields, [median.footprint])).toEqual([]);
    expect(difference([median.footprint], plan.roadway)).toEqual([]);
    expect(intersection([median.footprint], plan.blocks.map(block => block.outer))).toEqual([]);
    expect(median.ornaments.length).toBeGreaterThan(0);
    expect(islands.frontages.filter(frontage => frontage.ownerId === median.id)).toHaveLength(2);
  }

  const source = reservationInput(plan), before = structuredClone(source), result = StreetReservations.build(source);
  expect(source).toEqual(before);
  expect(StreetReservations.build(source)).toEqual(result);
  expect(() => StreetReservations.validate(result, source)).not.toThrow();
  const indices = result.owners.flatMap(owner => owner.groundIndices);
  expect([...indices].sort((a, b) => a - b)).toEqual(source.volumetric.ground.map((_, index) => index));
  expect(result.frontages).toHaveLength(source.planning.frontages.length);
  for (const owner of result.owners.filter(owner => owner.kind === 'block')) {
    expect(owner.excludedParcelIds).toEqual([`parcel:${owner.id}`]);
  }
  expect(result.parking.length).toBeGreaterThan(0);
  expect(result.parking.every(bay => bay.depth === 2 && bay.slotLength === 6 && bay.walkingClearance === 2.2)).toBe(true);
  const bay = result.parking[0], frontage = result.frontages.find(frontage => frontage.id === bay.frontageId)!;
  const authored = source.modules.parking!.find(value => value.blockId === bay.ownerId)!;
  expect([frontage.pavedWidth, frontage.curbWidth, frontage.gutterWidth]).toEqual([4.2, 0.2, 0.5]);
  expect(bay.start).toBe(authored.start + frontage.moduleStationOffset);
  expect(bay.slots).toEqual(authored.slots);
  for (const mutate of [
    (value: typeof result) => { value.owners[0].groundIndices.pop(); },
    (value: typeof result) => { value.frontages[0].inward = [0, 0]; },
    (value: typeof result) => { value.parking[0].footprint[0][0]++; },
  ]) {
    const invalid = structuredClone(result); mutate(invalid);
    expect(() => StreetReservations.validate(invalid, source)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  }
});

it('replaces paired highway corners with underpass sidewalks, skips excluded shores and refuses impossible clearance', () => {
  const plan = highwayPlan('source');
  const before = structuredClone(plan.planning);
  const originalGround = groundOf(plan);
  HighwayUnderpasses.apply(plan, { boundary: cityLand, water: [], clearHeight: 2.5 });
  const ground = groundOf(plan);
  expect(difference(originalGround, ground)).toEqual([]);
  expect(difference(ground, originalGround)).toEqual([]);
  expect(sum(ground)).toBeCloseTo(sum(originalGround), 6);
  expect(plan.planning.protected.length).toBeGreaterThan(0);
  for (const record of plan.planning.protected) {
    expect(record.replacedCornerIds).toHaveLength(2);
    expect(record.replacedCornerIds.every(id => before.corners.some(corner => corner.id === id))).toBe(true);
    expect(record.replacedCornerIds.some(id => plan.planning.corners.some(corner => corner.id === id))).toBe(false);
    expect(plan.modules.frontages!.some(frontage => frontage.id === record.ownerId)).toBe(true);
    const spans = plan.planning.frontages.filter(frontage => frontage.ownerId === record.ownerId);
    expect(spans).toHaveLength(2);
    expect(spans.map(frontage => [frontage.pavedWidth, frontage.curbWidth, frontage.gutterWidth]))
      .toEqual([[6, 0.2, 0.3], [6, 0.2, 0.3]]);
    expect(spans.every(frontage => frontage.cornerIds.every(id => id === null))).toBe(true);
    expect(spans.flatMap(frontage => frontage.edgeIds).sort()).toEqual([...record.edgeIds].sort());
    for (const frontage of plan.planning.frontages.filter(frontage => frontage.ownerId !== record.ownerId)) {
      const old = before.frontages.find(value => value.id === frontage.id);
      if (!old) continue;
      if (old.cornerIds[0] && record.replacedCornerIds.includes(old.cornerIds[0])) expect(frontage.start).toEqual(old.moduleStationOrigin);
      if (old.cornerIds[1] && record.replacedCornerIds.includes(old.cornerIds[1])) expect(frontage.end).toEqual(old.moduleStationEnd);
    }
  }

  const shore = highwayPlan('district');
  const highway = shore.edges.find(edge => edge.class === 'highway'
    && [edge.from, edge.to].every(id => shore.nodes.find(node => node.id === id)!.edgeIds.length === 4))!;
  const adjacent = shore.blocks.filter(block => block.edgeIds.includes(highway.id));
  expect(adjacent).toHaveLength(2);
  const removed = adjacent.slice(0, 1), removedIds = new Set(removed.map(block => block.id));
  const waterExcludedCorners = shore.planning.corners.filter(corner => removedIds.has(corner.ownerId));
  const opposite = shore.planning.frontages.find(frontage => frontage.ownerId === adjacent[1].id && frontage.edgeIds.includes(highway.id))!;
  const surviving = structuredClone(shore.planning.corners.filter(corner => opposite.cornerIds.includes(corner.id)));
  const settings = { boundary: cityLand, water: removed.map(block => block.outer), waterExcludedCorners, clearHeight: 2.5 };
  shore.blocks = shore.blocks.filter(block => !removedIds.has(block.id));
  shore.modules.placements = shore.modules.placements.filter(placement => !removedIds.has(placement.blockId));
  shore.modules.parking = shore.modules.parking?.filter(parking => !removedIds.has(parking.blockId));
  shore.planning.corners = shore.planning.corners.filter(corner => !removedIds.has(corner.ownerId));
  shore.planning.frontages = shore.planning.frontages.filter(frontage => !removedIds.has(frontage.ownerId));

  const missing = surviving[0], corrupt = structuredClone(shore);
  corrupt.modules.placements = corrupt.modules.placements.filter(placement => !(placement.blockId === missing.ownerId
    && placement.moduleId === missing.placement.moduleId && placement.turn === missing.placement.turn
    && placement.origin.every((value, axis) => value === missing.placement.origin[axis])));
  expect(() => HighwayUnderpasses.apply(corrupt, settings)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  expect(() => HighwayUnderpasses.apply(structuredClone(shore), { ...settings, waterExcludedCorners: [...waterExcludedCorners, missing] }))
    .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  expect(() => HighwayUnderpasses.apply(structuredClone(shore), { ...settings, clearHeight: -1 }))
    .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  expect(() => HighwayUnderpasses.apply(structuredClone(shore), { ...settings, clearHeight: 12 }))
    .toThrowError(expect.objectContaining({ code: 'E_UNSATISFIABLE' }));

  const groundBefore = groundOf(shore);
  HighwayUnderpasses.apply(shore, settings);
  const groundAfter = groundOf(shore);
  expect(difference(groundBefore, groundAfter)).toEqual([]);
  expect(difference(groundAfter, groundBefore)).toEqual([]);
  expect(intersection(groundAfter, settings.water)).toEqual([]);
  expect(sum(groundAfter)).toBeCloseTo(sum(groundBefore), 6);
  for (const corner of surviving) expect(shore.planning.corners).toContainEqual(corner);
  const excludedIds = new Set(waterExcludedCorners.map(corner => corner.id));
  expect(shore.planning.protected.flatMap(record => record.replacedCornerIds).some(id => excludedIds.has(id))).toBe(false);
});

it('publishes diagonal proposals in candidate mode and cuts blocks only in the compatibility mode', () => {
  const enabled = GridLayout.plan(candidateInput), disabled = GridLayout.plan({ ...candidateInput, diagonals: 'off' });
  const { diagonalCandidates, ...base } = enabled;
  expect(diagonalCandidates.length).toBeGreaterThan(0);
  expect({ ...base, diagonalCandidates: [] }).toEqual(disabled);
  const highways = new Set(enabled.runs.find(run => run.id === enabled.highwayRunId)!.edges.map(member => member.edgeId));
  const parking = new Set(enabled.modules.parking!.map(bay => bay.blockId));
  const blocks = new Map(enabled.blocks.map(block => [block.id, block]));
  for (const candidate of diagonalCandidates) {
    expect(candidate.roadProfile.lanes.length).toBeLessThanOrEqual(2);
    expect(candidate.constructionWidth).toBe(candidate.roadWidth
      + candidate.sidewalks.left.geometry!.totalWidth + candidate.sidewalks.right.geometry!.totalWidth);
    expect(candidate.reservationWidth).toBe(candidate.constructionWidth + 2 * candidate.reservationPadding);
    for (const mouth of [...candidate.mouths, ...candidate.intermediateMouths]) {
      expect(mouth.cornerClearances.every(clearance => clearance >= 3)).toBe(true);
      expect(parking.has(mouth.rectangleId)).toBe(false);
      expect(blocks.get(mouth.rectangleId)!.edgeIds.some(id => highways.has(id))).toBe(false);
    }
  }
  expect(diagonalCandidates.some(candidate => candidate.intermediateMouths.length === 2)).toBe(true);
  const first = diagonalCandidates[0];
  const retained = new Map(enabled.blocks.map(block => [block.id, `retained:${block.id}`]));
  const mapped = LayoutCandidates.retain([first], retained)[0];
  expect(mapped.id).toBe(first.id);
  expect(mapped.mouths[0].rectangleId).toBe(`retained:${first.mouths[0].rectangleId}`);
  retained.delete(first.mouths[0].rectangleId);
  expect(LayoutCandidates.retain([first], retained)).toEqual([]);
  expect(GridLayout.plan({ ...candidateInput, diagonalCornerClearance: 1000 })).toEqual(disabled);

  const applied = GridLayout.plan({ seed: 'urbe', diagonals: 'legacy-applied', size: { width: 1000, depth: 1000 },
    profiles: sourceDesign.profiles, sideAt: () => ({ profile: sourceDesign.sidewalkProfiles[1], finish: 'plain' }) });
  const cuts = applied.edges.filter(edge => edge.path[0][0] !== edge.path[1][0] && edge.path[0][1] !== edge.path[1][1]);
  expect(cuts).toHaveLength(2);
  expect(cuts.map(edge => Math.round(Math.atan2(Math.abs(edge.path[1][1] - edge.path[0][1]),
    Math.abs(edge.path[1][0] - edge.path[0][0])) * 180 / Math.PI)).sort()).toEqual([30, 45]);
  const nodes = new Map(applied.nodes.map(node => [node.id, node]));
  const edges = new Map(applied.edges.map(edge => [edge.id, edge]));
  for (const run of applied.runs) {
    let station = 0;
    for (const member of run.edges) {
      expect(member.start).toBeCloseTo(station, 9);
      expect(member.end - member.start).toBeCloseTo(length(edges.get(member.edgeId)!.path), 9);
      station = member.end;
    }
    expect(station).toBeCloseTo(run.length, 9);
  }
  for (const edge of cuts) {
    for (const id of [edge.from, edge.to]) {
      const node = nodes.get(id)!;
      expect(node.edgeIds).toHaveLength(3);
      for (const arm of node.edgeIds.filter(value => value !== edge.id)) {
        expect(length(edges.get(arm)!.path)).toBeGreaterThanOrEqual(40 - 1e-9);
      }
    }
    const block = applied.blocks.find(block => block.edgeIds.includes(edge.id))!;
    expect(block.interiors).toHaveLength(2);
    const placed = applied.modules.placements.filter(placement => placement.blockId === block.id);
    expect(placed).toHaveLength(1);
    expect(placed[0].moduleId).toMatch(/^diagonal:/);
    const supports = applied.planning.frontages.filter(frontage => frontage.ownerId === block.id);
    expect(supports.some(frontage => frontage.edgeIds.includes(edge.id))).toBe(true);
    expect(applied.planning.corners.filter(corner => corner.ownerId === block.id)
      .every(corner => corner.placement.moduleId === placed[0].moduleId)).toBe(true);
    expect(applied.modules.parking?.some(bay => bay.blockId === block.id) ?? false).toBe(false);
  }
}, 20000);
