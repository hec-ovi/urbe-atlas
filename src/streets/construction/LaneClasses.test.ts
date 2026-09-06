import { describe, expect, it } from 'vitest';
import { resolveStreetDesign } from './Design';
import { StreetSections } from './StreetSections';
import { validateStreetSections } from './validateSections';
import type { StreetConstruction, SectionedStreetEdge } from './schema/sections';
import type { LaneDesign } from './schema/design';

describe('street and avenue lane classes', () => {
  it('generates one- and two-lane streets and four-lane avenues from the default profiles', () => {
    const design = resolveStreetDesign();
    expect(design.profiles.map((profile) => [profile.classes, profile.lanes.length])).toEqual([
      [['street'], 1], [['street'], 2], [['road'], 4],
    ]);
    for (const [index, profile] of design.profiles.entries()) {
      const kind = profile.classes[0];
      const selected = resolveStreetDesign({ ...design,
        profiles: design.profiles.filter((candidate) => candidate === profile || !candidate.classes.includes(kind)),
      });
      const plan = StreetSections.plan([
        { id: 'e', class: kind, from: 'a', to: 'b', path: [[0, 0], [100, 0]] },
      ], [
        { id: 'a', position: [0, 0], edgeIds: ['e'] }, { id: 'b', position: [100, 0], edgeIds: ['e'] },
      ], selected, () => 'residential');
      expect(plan.edges[0].crossSection!.lanes).toHaveLength([1, 2, 4][index]);
      expect(plan.edges[0].width).toBe([4, 7, 14][index]);
      expect(plan.edges[0].crossSection!.lanes.map((lane) => lane.direction)).toEqual(profile.lanes.map((lane) => lane.direction));
    }
  });

  it('rejects incompatible new profile classes with a specific input error', () => {
    for (const [kind, count] of [['road', 2], ['road', 6], ['street', 4]] as const) {
      const design = resolveStreetDesign();
      const profile = design.profiles.find((entry) => entry.classes.includes(kind))!;
      profile.lanes = Array.from({ length: count }, () => ({ direction: 'forward', width: 3.5 }));
      expect(() => resolveStreetDesign(design)).toThrowError(expect.objectContaining({
        code: 'E_INVALID_PARAMS', message: expect.stringContaining(kind === 'road' ? 'avenues (road) require exactly 4 lanes' : 'streets require 1 or 2 lanes'),
      }));
    }
  });

  it('validates a saved six-lane avenue without rewriting its authored dimensions', () => {
    const lanes: (LaneDesign & { offset: number })[] = Array.from({ length: 6 }, (_, index) => ({
      direction: index < 3 ? 'backward' : 'forward', width: 3.5, offset: 8.75 - 3.5 * index,
    }));
    const bands = { curb: 0.15, border: 0.35, furnishing: 0.5, walking: 1.5, frontage: 0.5 };
    const edge: SectionedStreetEdge = {
      id: 'e', class: 'road', from: 'a', to: 'b', path: [[0, 0], [100, 0]], width: 21,
      sidewalk: { left: 3, right: 3 }, level: 0, elevationProfile: [], districtIds: [],
      crossSection: { runId: 'r', profileId: 'saved', lanes, shoulders: { left: 0, right: 0 }, sidewalks: {
        left: { profileId: 'compact', bands }, right: { profileId: 'compact', bands },
      } },
    };
    const construction: StreetConstruction = { version: '1.0.0', runs: [{
      id: 'r', profileId: 'saved', edges: [{ edgeId: 'e', forward: true, start: 0, end: 100 }], path: edge.path, length: 100,
    }] };
    const city = { streets: { edges: [edge], construction } };
    const before = JSON.stringify(city);
    expect(() => validateStreetSections(city)).not.toThrow();
    expect(JSON.stringify(city)).toBe(before);
  });
});
