import { expect, it } from 'vitest';
import { resolveStreetDesign } from '../construction/Design';
import { GridLayout } from './GridLayout';
import { LayoutCandidates } from './LayoutCandidates';
import type { GridLayoutInput } from './schema';

const design = resolveStreetDesign();
const input: GridLayoutInput = { seed: 'urbe', size: { width: 1000, depth: 1000 }, profiles: design.profiles,
  highway: true, sideAt: () => ({ profile: design.sidewalkProfiles[2], finish: 'plain' }) };

it('publishes default proposals while preserving the complete off-mode layout and protected frontages', () => {
  const enabled = GridLayout.plan(input), disabled = GridLayout.plan({ ...input, diagonals: 'off' });
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
});

it('fails invalid modes and clearances instead of applying cuts', () => {
  expect(() => GridLayout.plan({ ...input, diagonals: 'bad' as 'off' }))
    .toThrow(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  expect(() => GridLayout.plan({ ...input, diagonalCornerClearance: NaN }))
    .toThrow(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  const blocked = GridLayout.plan({ ...input, diagonalCornerClearance: 1000 });
  expect(blocked.diagonalCandidates).toEqual([]);
  expect(blocked).toEqual(GridLayout.plan({ ...input, diagonals: 'off' }));
});
