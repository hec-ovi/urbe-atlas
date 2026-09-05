import { describe, expect, it } from 'vitest';
import { resolveStreetDesign } from './Design';
import { StreetSections } from './StreetSections';
import { sidewalkBand } from './SidewalkSection';
import { validateStreetSections } from './validateSections';
import type { SidewalkProfile } from './schema/design';

const profile = (width: number): SidewalkProfile => ({
  id: `p${width}`, curb: 0.2, border: 0, furnishing: 0, walking: width, frontage: 0,
  edge: { curbRise: 0.2, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' } } },
});

function plan(profiles: SidewalkProfile[]) {
  const design = resolveStreetDesign({ ...resolveStreetDesign(), sidewalkProfiles: profiles,
    sidewalkAssignments: [{ district: 'residential', street: profiles[0].id }, { district: 'commercial', street: profiles.at(-1)!.id }],
  });
  return StreetSections.plan([
    { id: 'e', class: 'street', from: 'a', to: 'b', path: [[0, 0], [100, 0]] },
  ], [
    { id: 'a', position: [0, 0], edgeIds: ['e'] }, { id: 'b', position: [100, 0], edgeIds: ['e'] },
  ], design, ([, z]) => z > 0 ? 'residential' : 'commercial');
}

describe('explicit sidewalk edge geometry', () => {
  it('publishes independent paved spans outside a shared gutter and curb cross section', () => {
    const input = [profile(2), profile(4), profile(6)];
    const before = JSON.stringify(input);
    const output = plan(input);
    const edge = output.edges[0];
    expect(edge.width).toBe(7);
    expect(edge.sidewalk).toEqual({ left: 2.5, right: 6.5 });
    expect(edge.crossSection!.sidewalks.left.geometry).toEqual({
      version: '1.0.0', edge: input[0].edge, pavedWidth: 2, totalWidth: 2.5,
      intervals: [
        { role: 'gutter-lip', start: 0, end: 0.02, top: 0.02 },
        { role: 'gutter', start: 0.02, end: 0.3, top: 0 },
        { role: 'curb', start: 0.3, end: 0.5, top: 0.2 },
        { role: 'border', start: 0.5, end: 0.5, top: 0.2 },
        { role: 'furnishing', start: 0.5, end: 0.5, top: 0.2 },
        { role: 'walking', start: 0.5, end: 2.5, top: 0.2 },
        { role: 'frontage', start: 2.5, end: 2.5, top: 0.2 },
      ],
    });
    expect(sidewalkBand(edge, 'left', 'walking')).toEqual({ offset: 1.5, width: 2 });
    expect(plan([profile(4)]).edges[0].sidewalk.left).toBe(4.5);
    expect(plan(input)).toEqual(output);
    expect(JSON.stringify(input)).toBe(before);
    const city = { streets: { edges: output.edges, construction: { version: '1.0.0' as const, runs: output.runs } } };
    expect(() => validateStreetSections(city)).not.toThrow();
    edge.crossSection!.sidewalks.left.geometry!.intervals[2].start += 0.01;
    expect(() => validateStreetSections(city)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });

  it('rejects invalid dimensions before planning and preserves legacy output shape', () => {
    for (const change of [
      (p: SidewalkProfile) => { p.curb = 0; },
      (p: SidewalkProfile) => { p.edge!.curbRise = Infinity; },
      (p: SidewalkProfile) => { p.edge!.gutter.width = -1; },
      (p: SidewalkProfile) => { p.edge!.gutter.lip.width = 0.3; },
      (p: SidewalkProfile) => { p.edge!.gutter.lip.height = 0.21; },
      (p: SidewalkProfile) => { p.walking = 0; },
    ]) {
      const value = profile(2); change(value);
      expect(() => plan([value])).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    }
    const legacy = resolveStreetDesign().sidewalkProfiles[0];
    const output = plan([legacy]);
    expect(output.edges[0].sidewalk).toEqual({ left: 3, right: 3 });
    expect(output.edges[0].crossSection!.sidewalks.left).toEqual({ profileId: legacy.id, bands: {
      curb: 0.15, border: 0.35, furnishing: 0.5, walking: 1.5, frontage: 0.5,
    } });
  });
});
