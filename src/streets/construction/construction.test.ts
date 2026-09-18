import { describe, expect, it } from 'vitest';
import { resolveStreetDesign } from './Design';
import { districtStreetDesign } from './DistrictDesign';
import { StreetSections } from './StreetSections';
import { sidewalkBand } from './SidewalkSection';
import { validateStreetSections } from './validateSections';
import type { LaneDesign, RoadProfile, SidewalkProfile, StreetDesign } from './schema/design';
import type { SectionedStreetEdge, StreetConstruction } from './schema/sections';
import type { BuiltEdge, BuiltNode } from '../Graph';
import fixture from './fixtures/one-way.input.json';

type DistrictAt = Parameters<typeof StreetSections.plan>[3];

const EDGE_GEOMETRY = { curbRise: 0.2, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' } } } as const;

const sidewalkProfile = (width: number): SidewalkProfile => ({
  id: `p${width}`, curb: 0.2, border: 0, furnishing: 0, walking: width, frontage: 0,
  edge: { curbRise: 0.2, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' } } },
});

const city = (output: { edges: SectionedStreetEdge[]; runs: StreetConstruction['runs'] }) =>
  ({ streets: { edges: output.edges, construction: { version: '1.0.0' as const, runs: output.runs } } });

/** One 100 m edge between two nodes, planned with the supplied design. */
function planStraight(design: StreetDesign, kind: BuiltEdge['class'] = 'street',
  districtAt: DistrictAt = () => 'residential') {
  return StreetSections.plan(
    [{ id: 'e', class: kind, from: 'a', to: 'b', path: [[0, 0], [100, 0]] }],
    [{ id: 'a', position: [0, 0], edgeIds: ['e'] }, { id: 'b', position: [100, 0], edgeIds: ['e'] }] as BuiltNode[],
    design, districtAt);
}

/** Two reversed avenue edges sharing one through-run. */
function planAvenue(input: StreetDesign) {
  return city(StreetSections.plan([
    { id: 'a', class: 'road', from: 'n0', to: 'n1', path: [[0, 0], [20, 0]] },
    { id: 'b', class: 'road', from: 'n2', to: 'n1', path: [[40, 0], [20, 0]] },
  ], [
    { id: 'n0', position: [0, 0], edgeIds: ['a'] },
    { id: 'n1', position: [20, 0], edgeIds: ['a', 'b'] },
    { id: 'n2', position: [40, 0], edgeIds: ['b'] },
  ], resolveStreetDesign(input), () => 'downtown'));
}

/** The three explicit sidewalk profiles, assigned left (residential) and right (commercial). */
function planSides(profiles: SidewalkProfile[]) {
  const defaults = resolveStreetDesign();
  return planStraight(resolveStreetDesign({ ...defaults,
    profiles: defaults.profiles.filter((profile) => !profile.classes.includes('street') || profile.lanes.length === 2),
    sidewalkProfiles: profiles,
    sidewalkAssignments: [{ district: 'residential', street: profiles[0].id }, { district: 'commercial', street: profiles.at(-1)!.id }],
  }), 'street', ([, z]) => z > 0 ? 'residential' : 'commercial');
}

describe('street construction', () => {
  it('resolves the default lane classes, paved sidewalk widths and crossing clearance', () => {
    const design = resolveStreetDesign();
    expect(design.profiles.map((profile) => [profile.classes, profile.lanes.length])).toEqual([
      [['street'], 1], [['street'], 2], [['road'], 4],
    ]);
    expect(design.sidewalkProfiles.map(({ border, furnishing, walking, frontage }) => border + furnishing + walking + frontage))
      .toEqual([2, 4, 6]);
    for (const profile of design.sidewalkProfiles) {
      expect(profile.curb).toBe(0.2);
      expect(profile.edge).toEqual(EDGE_GEOMETRY);
    }
    expect(design.crossings).toEqual({ pedestrianClearance: 2.5 });
    expect(resolveStreetDesign({ ...design, crossings: { pedestrianClearance: 3 } }).crossings)
      .toEqual({ pedestrianClearance: 3 });
    for (const [index, profile] of design.profiles.entries()) {
      const kind = profile.classes[0];
      const selected = resolveStreetDesign({ ...design,
        profiles: design.profiles.filter((candidate) => candidate === profile || !candidate.classes.includes(kind)),
      });
      const plan = planStraight(selected, kind);
      expect(plan.edges[0].width).toBe([4, 7, 14][index]);
      expect(plan.edges[0].crossSection!.lanes.map((lane) => lane.direction))
        .toEqual(profile.lanes.map((lane) => lane.direction));
      expect(plan.edges[0].sidewalk).toEqual({ left: [2.5, 2.5, 4.5][index], right: [2.5, 2.5, 4.5][index] });
    }
  });

  it('publishes independent paved spans outside a shared gutter and curb cross section', () => {
    const input = [sidewalkProfile(2), sidewalkProfile(4), sidewalkProfile(6)];
    const before = JSON.stringify(input);
    const output = planSides(input);
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
    expect(planSides(input)).toEqual(output);
    expect(JSON.stringify(input)).toBe(before);
    const published = city(output);
    expect(() => validateStreetSections(published)).not.toThrow();
    edge.crossSection!.sidewalks.left.geometry!.intervals[2].start += 0.01;
    expect(() => validateStreetSections(published)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));

    const legacy: SidewalkProfile = { id: 'legacy', curb: 0.15, border: 0.35, furnishing: 0.5, walking: 1.5, frontage: 0.5 };
    const plain = planSides([legacy]);
    expect(plain.edges[0].sidewalk).toEqual({ left: 3, right: 3 });
    expect(plain.edges[0].crossSection!.sidewalks.left).toEqual({ profileId: legacy.id, bands: {
      curb: 0.15, border: 0.35, furnishing: 0.5, walking: 1.5, frontage: 0.5,
    } });
  });

  it('validates a generated one-way run and a saved avenue without rewriting either', () => {
    const input = resolveStreetDesign();
    input.profiles = [fixture.profile as StreetDesign['profiles'][number],
      ...input.profiles.filter((profile) => profile.classes.includes('road'))];
    input.sidewalkAssignments = [{ district: 'residential', street: 'standard' }, { district: 'commercial', street: 'broad' }];
    const design = resolveStreetDesign(input);
    const plan = StreetSections.plan(fixture.edges as BuiltEdge[], fixture.nodes as BuiltNode[], design,
      ([, z]) => z > 0 ? 'residential' : 'commercial');
    expect(plan.edges.map((edge) => edge.width)).toEqual([3.5, 3.5]);
    expect(plan.edges.map((edge) => edge.crossSection!.lanes)).toEqual([
      [{ direction: 'forward', width: 3.5, offset: 0 }],
      [{ direction: 'backward', width: 3.5, offset: 0 }],
    ]);
    expect(plan.edges.map((edge) => edge.sidewalk)).toEqual([{ left: 4.5, right: 6.5 }, { left: 6.5, right: 4.5 }]);
    const generated = city(plan);
    expect(() => validateStreetSections(generated)).not.toThrow();
    plan.edges[1].crossSection!.lanes[0].direction = 'forward';
    expect(() => validateStreetSections(generated)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    design.sidewalkAssignments![0].street = 'compact';
    expect(input.sidewalkAssignments[0].street).toBe('standard');

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
    const saved = { streets: { edges: [edge], construction: { version: '1.0.0' as const, runs: [{
      id: 'r', profileId: 'saved', edges: [{ edgeId: 'e', forward: true, start: 0, end: 100 }], path: edge.path, length: 100,
    }] } } };
    const authored = JSON.stringify(saved);
    expect(() => validateStreetSections(saved)).not.toThrow();
    expect(JSON.stringify(saved)).toBe(authored);
  });

  it('reserves a district median and keeps asymmetric lanes across reversed run members', () => {
    const input = districtStreetDesign();
    const avenue = input.profiles.find((profile) => profile.classes.includes('road'))!;
    avenue.median = { width: 3.4 };
    avenue.shoulders = { left: 0.25, right: 0.75 };
    avenue.lanes[0].width = 3;
    avenue.lanes[3].width = 4;
    const design = resolveStreetDesign(input);
    expect(design.moduleFormat).toBe('district');
    const published = planAvenue(design);
    expect(published.streets.construction.runs).toHaveLength(1);
    const [first, second] = published.streets.edges.map((edge) => edge.crossSection!);
    expect(published.streets.edges[0].width).toBeCloseTo(18.4, 10);
    expect(first.median).toEqual({ width: 3.4 });
    expect(first.shoulders).toEqual({ left: 0.25, right: 0.75 });
    expect(second.shoulders).toEqual({ left: 0.75, right: 0.25 });
    expect(first.lanes.map((lane) => [lane.width, Number(lane.offset.toFixed(2))]))
      .toEqual([[3, 7.45], [3.5, 4.2], [3.5, -2.7], [4, -6.45]]);
    expect(second.lanes.map((lane) => [lane.width, Number(lane.offset.toFixed(2))]))
      .toEqual([[4, 6.45], [3.5, 2.7], [3.5, -4.2], [3, -7.45]]);
    for (const side of Object.values(first.sidewalks)) {
      expect(side.geometry!.pavedWidth).toBe(4.2);
      expect(side.geometry!.totalWidth).toBeCloseTo(4.9, 10);
      expect(side.bands).toEqual({ curb: 0.2, border: 1, furnishing: 1, walking: 2, frontage: 0.2 });
      expect(side.geometry!.edge.gutter.width).toBe(0.5);
    }
    expect(() => validateStreetSections(published)).not.toThrow();
    // Keep total width and valid local offsets while changing the reserved median.
    second.median!.width -= 1;
    second.shoulders.right += 1;
    second.lanes[2].offset += 1;
    second.lanes[3].offset += 1;
    expect(() => validateStreetSections(published)).toThrowError(expect.objectContaining({
      code: 'E_INVARIANT', message: expect.stringContaining('changes median width'),
    }));
    expect(design).toEqual(resolveStreetDesign(input));
  });

  it('rejects malformed profiles, medians, sidewalk dimensions and assignments', () => {
    const base = resolveStreetDesign();
    for (const changes of [
      { moduleFormat: 'unknown' },
      { crossings: null }, { crossings: { pedestrianClearance: 0 } }, { crossings: { pedestrianClearance: Infinity } },
      { sidewalkAssignments: [{ district: 'residential', street: 'missing' }] },
      { sidewalkAssignments: [{ district: 'residential' }] },
      { sidewalkAssignments: [{ district: 'other', street: 'compact' }] },
      { sidewalkAssignments: [{ district: 'residential', street: 'compact' }, { district: 'residential', road: 'compact' }] },
      { profiles: [{ ...base.profiles[0], lanes: [] }] },
    ]) expect(() => resolveStreetDesign({ ...base, ...changes } as StreetDesign)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));

    for (const [kind, count] of [['road', 2], ['road', 6], ['street', 4]] as const) {
      const design = resolveStreetDesign();
      const profile = design.profiles.find((entry) => entry.classes.includes(kind))!;
      profile.lanes = Array.from({ length: count }, () => ({ direction: 'forward', width: 3.5 }));
      expect(() => resolveStreetDesign(design)).toThrowError(expect.objectContaining({
        code: 'E_INVALID_PARAMS',
        message: expect.stringContaining(kind === 'road' ? 'avenues (road) require exactly 4 lanes' : 'streets require 1 or 2 lanes'),
      }));
    }

    const medians: ((profile: RoadProfile) => void)[] = [
      (profile) => { profile.median!.width = 0; },
      (profile) => { profile.lanes[1].direction = 'forward'; },
    ];
    for (const change of medians) {
      const input = districtStreetDesign();
      const avenue = input.profiles.find((profile) => profile.classes.includes('road'))!;
      avenue.median = { width: 3.4 };
      const published = planAvenue(input);
      change(avenue);
      expect(() => resolveStreetDesign(input)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
      Object.assign(published.streets.edges[0].crossSection!, { median: avenue.median, lanes: avenue.lanes });
      expect(() => validateStreetSections(published)).toThrowError(expect.objectContaining({
        code: 'E_INVARIANT', message: expect.stringContaining('invalid median reservation'),
      }));
    }
    const street = districtStreetDesign();
    street.profiles.find((profile) => profile.classes.includes('street'))!.median = { width: 3.4 };
    expect(() => resolveStreetDesign(street)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));

    for (const change of [
      (p: SidewalkProfile) => { p.curb = 0; },
      (p: SidewalkProfile) => { p.edge!.curbRise = Infinity; },
      (p: SidewalkProfile) => { p.edge!.gutter.width = -1; },
      (p: SidewalkProfile) => { p.edge!.gutter.lip.width = 0.3; },
      (p: SidewalkProfile) => { p.edge!.gutter.lip.height = 0.21; },
      (p: SidewalkProfile) => { p.walking = 0; },
    ]) {
      const value = sidewalkProfile(2); change(value);
      expect(() => planSides([value])).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    }
  });
});
