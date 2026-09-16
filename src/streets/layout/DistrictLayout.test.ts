import { expect, it } from 'vitest';
import { GridLayout } from './GridLayout';
import { districtStreetDesign } from '../construction/DistrictDesign';
import { ModuleGround } from '../construction/modules/ModuleGround';
import { StreetReservations } from './reservations/StreetReservations';
import { validateStreetSections } from '../construction/validateSections';
import type { GridLayoutInput } from './schema';

const design = districtStreetDesign();
const input: GridLayoutInput = { seed: 'district-review', moduleFormat: 'district', size: { width: 800, depth: 800 },
  profiles: design.profiles, highway: true, diagonals: 'off', districtCenters: [[400, 400]],
  sideAt: ([x, z]) => ({ profile: design.sidewalkProfiles[0], finish: x + z < 800 ? 'luxury-blue' : 'luxury-red' }),
  perimeter: { profile: design.sidewalkProfiles[0], finish: 'luxury-red' } };

it('reserves complete district blocks, source-owned parking and selected central avenue medians', () => {
  const plan = GridLayout.plan(input);
  expect(GridLayout.plan(input)).toEqual(plan);
  const reservedRuns = new Set(plan.edges.filter(edge => edge.crossSection?.median).map(edge => edge.crossSection!.runId));
  expect(reservedRuns.size).toBe(1);
  expect(reservedRuns.has(plan.highwayRunId!)).toBe(false);
  expect(plan.edges.some(edge => edge.class === 'road' && !edge.crossSection?.median)).toBe(true);
  const complete = { streets: { edges: plan.edges, construction: { version: '1.0.0' as const, runs: plan.runs } } };
  expect(() => validateStreetSections(complete)).not.toThrow();
  for (const block of plan.blocks) {
    const fronts = plan.planning.frontages.filter(front => front.ownerId === block.id);
    expect(fronts).toHaveLength(4);
    expect(fronts.every(front => front.pavedWidth === 4.2 && front.gutterWidth === 0.5)).toBe(true);
    expect(new Set(plan.modules.placements.filter(item => item.blockId === block.id).map(item => item.finish)).size).toBe(1);
  }
  const reservations = StreetReservations.build({ planning: plan.planning, layoutBlocks: plan.blocks, modules: plan.modules,
    streets: { ...complete.streets, nodes: plan.nodes, highwayStructures: [] },
    blocks: plan.blocks.map(block => ({ id: block.id, parcelIds: [] })), parcels: [], transit: { subwayStations: [] },
    volumetric: { ground: [...ModuleGround.cover(plan.modules).map(({ blockId, ...field }) => ({ ...field, moduleBlockId: blockId })),
      ...plan.roadway.map(polygon => ({ surface: 'roadway' as const, polygon, top: 0, bottom: -0.2 }))] } });
  expect(reservations.parking.length).toBeGreaterThan(0);
  expect(reservations.parking.every(bay => bay.depth === 2 && bay.walkingClearance === 2.2)).toBe(true);
});

it('rejects incompatible district construction and malformed district centers', () => {
  expect(() => GridLayout.plan({ ...input, diagonals: 'legacy-applied' })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  expect(() => GridLayout.plan({ ...input, districtCenters: [[NaN, 0]] })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
});
