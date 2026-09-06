import { describe, expect, it } from 'vitest';
import { resolveStreetDesign } from './Design';
import { StreetSections } from './StreetSections';
import { validateStreetSections } from './validateSections';
import type { StreetDesign } from './schema/design';
import type { BuiltEdge, BuiltNode } from '../Graph';
import fixture from './fixtures/one-way.input.json';

const edges = fixture.edges as BuiltEdge[];
const nodes = fixture.nodes as BuiltNode[];

describe('explicit street profiles', () => {
  it('defaults to whole paved widths with dimensioned curbs and gutters', () => {
    const profiles = resolveStreetDesign().sidewalkProfiles;
    expect(profiles.map(({ border, furnishing, walking, frontage }) => border + furnishing + walking + frontage)).toEqual([2, 4, 6]);
    for (const profile of profiles) {
      expect(profile.curb).toBe(0.2);
      expect(profile.edge).toEqual({ curbRise: 0.2, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' } } });
    }
  });

  it('preserves a one-way run across reversed edges and reserves each assigned sidewalk independently', () => {
    const input = resolveStreetDesign();
    input.profiles = [fixture.profile as StreetDesign['profiles'][number], ...input.profiles.filter((profile) => profile.classes.includes('road'))];
    input.sidewalkAssignments = [{ district: 'residential', street: 'standard' }, { district: 'commercial', street: 'broad' }];
    const design = resolveStreetDesign(input);
    const plan = StreetSections.plan(edges, nodes, design, ([, z]) => z > 0 ? 'residential' : 'commercial');
    expect(plan.edges.map((edge) => edge.width)).toEqual([3.5, 3.5]);
    expect(plan.edges.map((edge) => edge.crossSection!.lanes)).toEqual([
      [{ direction: 'forward', width: 3.5, offset: 0 }],
      [{ direction: 'backward', width: 3.5, offset: 0 }],
    ]);
    expect(plan.edges.map((edge) => edge.sidewalk)).toEqual([{ left: 4.5, right: 6.5 }, { left: 6.5, right: 4.5 }]);
    const city = { streets: { edges: plan.edges, construction: { version: '1.0.0' as const, runs: plan.runs } } };
    expect(() => validateStreetSections(city)).not.toThrow();
    plan.edges[1].crossSection!.lanes[0].direction = 'forward';
    expect(() => validateStreetSections(city)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    design.sidewalkAssignments![0].street = 'compact';
    expect(input.sidewalkAssignments[0].street).toBe('standard');
  });

  it('resolves positive crossing clearance and rejects invalid assignments or lane declarations', () => {
    expect(resolveStreetDesign().crossings).toEqual({ pedestrianClearance: 2.5 });
    expect(resolveStreetDesign({ ...resolveStreetDesign(), crossings: { pedestrianClearance: 3 } }).crossings).toEqual({ pedestrianClearance: 3 });
    const base = resolveStreetDesign();
    for (const changes of [
      { crossings: null }, { crossings: { pedestrianClearance: 0 } }, { crossings: { pedestrianClearance: Infinity } },
      { sidewalkAssignments: [{ district: 'residential', street: 'missing' }] },
      { sidewalkAssignments: [{ district: 'residential' }] },
      { sidewalkAssignments: [{ district: 'other', street: 'compact' }] },
      { sidewalkAssignments: [{ district: 'residential', street: 'compact' }, { district: 'residential', road: 'compact' }] },
      { profiles: [{ ...base.profiles[0], lanes: [] }] },
    ]) expect(() => resolveStreetDesign({ ...base, ...changes } as StreetDesign)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  });
});
