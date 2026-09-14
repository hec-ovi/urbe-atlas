import { expect, it } from 'vitest';
import { GridLayout } from '../GridLayout';
import { resolveStreetDesign } from '../../construction/Design';
import { ModuleGround } from '../../construction/modules/ModuleGround';
import { StreetReservations } from './StreetReservations';
import type { ReservationInput } from './schema';

function input(): ReservationInput {
  const design = resolveStreetDesign();
  const plan = GridLayout.plan({ seed: 'modules', size: { width: 800, depth: 800 }, profiles: design.profiles,
    diagonals: false, sideAt: () => ({ profile: design.sidewalkProfiles[2], finish: 'maintained' }),
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
    (value: typeof result) => { value.parking[0].footprint[0][0]++; },
    (value: typeof result) => { value.owners.find(owner => owner.kind === 'block')!.interiors = [source.volumetric.ground[0].polygon]; },
  ]) {
    const invalid = structuredClone(result); mutate(invalid);
    expect(() => StreetReservations.validate(invalid, source)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  }
});
