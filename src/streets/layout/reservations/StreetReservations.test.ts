import { expect, it } from 'vitest';
import { GridLayout } from '../GridLayout';
import { resolveStreetDesign } from '../../construction/Design';
import { ModuleGround } from '../../construction/modules/ModuleGround';
import { StreetModuleKit } from '../../construction/modules/StreetModuleKit';
import { StreetReservations } from './StreetReservations';
import type { ReservationInput } from './schema';

function input(): ReservationInput {
  const design = resolveStreetDesign();
  const plan = GridLayout.plan({ seed: 'modules', size: { width: 800, depth: 800 }, profiles: design.profiles,
    diagonals: 'off', sideAt: () => ({ profile: design.sidewalkProfiles[2], finish: 'maintained' }),
    perimeter: { profile: design.sidewalkProfiles[0], finish: 'maintained' } });
  return { planning: plan.planning, layoutBlocks: plan.blocks, modules: plan.modules,
    streets: { nodes: plan.nodes, edges: plan.edges, highwayStructures: [] },
    blocks: plan.blocks.map(block => ({ id: block.id, parcelIds: [`parcel:${block.id}`] })),
    parcels: plan.blocks.map(block => ({ id: `parcel:${block.id}`, lot: block.interior })),
    transit: { subwayStations: [] }, volumetric: { ground: [
      ...ModuleGround.cover(plan.modules).map(({ blockId, ...ground }) => ({ ...ground, moduleBlockId: blockId })),
      ...plan.roadway.map(polygon => ({ surface: 'roadway' as const, polygon, bottom: -0.2, top: 0 })),
    ] } };
}

it('publishes complete ground ownership with source supports, local exclusions and native parking', () => {
  const source = input(), original = structuredClone(source), result = StreetReservations.build(source);
  expect(source).toEqual(original);
  expect(StreetReservations.build(source)).toEqual(result);
  const indices = result.owners.flatMap(owner => owner.groundIndices);
  expect([...indices].sort((a, b) => a - b)).toEqual(source.volumetric.ground.map((_, index) => index));
  expect(new Set(indices).size).toBe(indices.length);
  expect(result.parking.length).toBeGreaterThan(0);
  expect(result.frontages).toHaveLength(source.planning.frontages.length);
  for (const owner of result.owners.filter(owner => owner.kind === 'block')) expect(owner.excludedParcelIds).toEqual([`parcel:${owner.id}`]);
  const bay = result.parking[0], frontage = result.frontages.find(frontage => frontage.id === bay.frontageId)!;
  const originalBay = source.modules.parking!.find(value => value.blockId === bay.ownerId)!;
  expect(bay.start).toBe(originalBay.start + frontage.moduleStationOffset);
  expect(bay.slots).toEqual(originalBay.slots);
  result.frontages[0].start[0]++;
  expect(source).toEqual(original);
});

it('rejects broken owner indices, source frames, parking and exclusion boundaries', () => {
  const source = input(), result = StreetReservations.build(source);
  for (const mutate of [
    (value: typeof result) => { value.groundArray.count++; },
    (value: typeof result) => { value.owners[0].groundIndices.push(value.owners[0].groundIndices[0]); },
    (value: typeof result) => { value.owners[0].groundIndices.pop(); },
    (value: typeof result) => { value.frontages[0].inward = [0, 0]; },
    (value: typeof result) => { value.corners[0].placement.moduleId = 'unknown'; },
    (value: typeof result) => { value.parking[0].footprint[0][0]++; },
    (value: typeof result) => { value.owners.find(owner => owner.kind === 'block')!.interiors = [source.volumetric.ground[0].polygon]; },
  ]) {
    const invalid = structuredClone(result); mutate(invalid);
    expect(() => StreetReservations.validate(invalid, source)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  }
});

it('retains district frontage dimensions and two-metre native parking from the authored module ground', () => {
  const kit = new StreetModuleKit('district');
  const block = kit.block({ id: 'district-block', origin: [10000.1, 20000.1], panels: [80, 64], sidewalks: [4, 4, 4, 4],
    finish: 'luxury-blue', parking: [{ side: 0, start: 8, slots: 2, profile: 'native' }] });
  const modules = kit.construction(), planning = block.planning!;
  const edges: ReservationInput['streets']['edges'] = planning.frontages.map(frontage => ({
    id: `edge:${frontage.side}`, class: 'street', from: `from:${frontage.side}`, to: `to:${frontage.side}`,
    path: [frontage.start, frontage.end], width: 7, sidewalk: { left: 4.9, right: 4.9 }, districtIds: [], level: 0,
    elevationProfile: [{ distance: 0, level: 0 }, { distance: Math.hypot(frontage.end[0] - frontage.start[0], frontage.end[1] - frontage.start[1]), level: 0 }],
  }));
  const source: ReservationInput = {
    planning: { ...planning, frontages: planning.frontages.map(frontage => ({ ...frontage, edgeIds: [`edge:${frontage.side}`] })), protected: [] },
    layoutBlocks: [block], modules, streets: { edges, highwayStructures: [], nodes: edges.flatMap(edge => [
      { id: edge.from, position: edge.path[0], edgeIds: [edge.id], connections: [{ level: 0, edgeIds: [edge.id] }] },
      { id: edge.to, position: edge.path[1], edgeIds: [edge.id], connections: [{ level: 0, edgeIds: [edge.id] }] },
    ]) }, blocks: [{ id: block.id, parcelIds: ['parcel'] }], parcels: [{ id: 'parcel', lot: block.interior }],
    transit: { subwayStations: [] }, volumetric: { ground: ModuleGround.cover(modules)
      .map(({ blockId, ...ground }) => ({ ...ground, moduleBlockId: blockId })) },
  };
  const original = structuredClone(source), result = StreetReservations.build(source);
  expect(result.frontages.map(frontage => [frontage.pavedWidth, frontage.curbWidth, frontage.gutterWidth]))
    .toEqual(Array.from({ length: 4 }, () => [4.2, 0.2, 0.5]));
  expect(result.parking).toHaveLength(1);
  expect([result.parking[0].depth, result.parking[0].slotLength, result.parking[0].walkingClearance]).toEqual([2, 6, 2.2]);
  expect(result.parking[0].slots).toEqual(modules.parking![0].slots);
  expect(() => StreetReservations.validate(result, source)).not.toThrow();
  expect(source).toEqual(original);
  expect(StreetReservations.build(source)).toEqual(result);
  const wrongGutter = structuredClone(source); wrongGutter.planning.frontages[0].gutterWidth = 0.3;
  expect(() => StreetReservations.build(wrongGutter)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  const wrongParking = structuredClone(result); wrongParking.parking[0].depth = 2.5;
  expect(() => StreetReservations.validate(wrongParking, source)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
});
