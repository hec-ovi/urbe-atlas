import { describe, expect, it } from 'vitest';
import { resolveStreetDesign } from './Design';
import { districtStreetDesign } from './DistrictDesign';
import { StreetSections } from './StreetSections';
import { validateStreetSections } from './validateSections';
import type { RoadProfile, StreetDesign } from './schema/design';

function plan(input: StreetDesign) {
  const design = resolveStreetDesign(input);
  const output = StreetSections.plan([
    { id: 'a', class: 'road', from: 'n0', to: 'n1', path: [[0, 0], [20, 0]] },
    { id: 'b', class: 'road', from: 'n2', to: 'n1', path: [[40, 0], [20, 0]] },
  ], [
    { id: 'n0', position: [0, 0], edgeIds: ['a'] },
    { id: 'n1', position: [20, 0], edgeIds: ['a', 'b'] },
    { id: 'n2', position: [40, 0], edgeIds: ['b'] },
  ], design, () => 'downtown');
  return { streets: { edges: output.edges, construction: { version: '1.0.0' as const, runs: output.runs } } };
}

describe('divided avenue profiles', () => {
  it('reserves a district median and complete sidewalks without narrowing lanes', () => {
    const input = districtStreetDesign();
    input.profiles.find(profile => profile.classes.includes('road'))!.median = { width: 3.4 };
    const design = resolveStreetDesign(input);
    expect(design.moduleFormat).toBe('district');
    const city = plan(design);
    const road = city.streets.edges[0];
    expect(road.width).toBeCloseTo(17.4, 10);
    expect(road.crossSection!.median).toEqual({ width: 3.4 });
    expect(road.crossSection!.lanes.map(lane => lane.width)).toEqual([3.5, 3.5, 3.5, 3.5]);
    expect(road.crossSection!.lanes.map(lane => Number(lane.offset.toFixed(2)))).toEqual([6.95, 3.45, -3.45, -6.95]);
    for (const side of Object.values(road.crossSection!.sidewalks)) {
      expect(side.geometry!.pavedWidth).toBe(4.2);
      expect(side.geometry!.totalWidth).toBeCloseTo(4.9, 10);
      expect(side.bands).toEqual({ curb: 0.2, border: 1, furnishing: 1, walking: 2, frontage: 0.2 });
      expect(side.geometry!.edge.gutter.width).toBe(0.5);
    }
    expect(() => validateStreetSections(city)).not.toThrow();
    road.crossSection!.lanes[2].offset += 0.2;
    expect(() => validateStreetSections(city)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    expect(design).toEqual(resolveStreetDesign(input));
  });

  it('preserves asymmetric lanes, shoulders and median width across reversed run members', () => {
    const input = districtStreetDesign();
    const avenue = input.profiles.find(profile => profile.classes.includes('road'))!;
    avenue.median = { width: 3.4 };
    avenue.shoulders = { left: 0.25, right: 0.75 };
    avenue.lanes[0].width = 3;
    avenue.lanes[3].width = 4;
    const city = plan(input);
    expect(city.streets.construction.runs).toHaveLength(1);
    const [first, second] = city.streets.edges.map(edge => edge.crossSection!);
    expect(first.shoulders).toEqual({ left: 0.25, right: 0.75 });
    expect(second.shoulders).toEqual({ left: 0.75, right: 0.25 });
    expect(first.lanes.map(lane => [lane.width, Number(lane.offset.toFixed(2))])).toEqual([[3, 7.45], [3.5, 4.2], [3.5, -2.7], [4, -6.45]]);
    expect(second.lanes.map(lane => [lane.width, Number(lane.offset.toFixed(2))])).toEqual([[4, 6.45], [3.5, 2.7], [3.5, -4.2], [3, -7.45]]);
    expect(() => validateStreetSections(city)).not.toThrow();
    // Keep total width and valid local offsets while changing the reserved median.
    second.median!.width -= 1;
    second.shoulders.right += 1;
    second.lanes[2].offset += 1;
    second.lanes[3].offset += 1;
    expect(() => validateStreetSections(city)).toThrowError(expect.objectContaining({
      code: 'E_INVARIANT', message: expect.stringContaining('changes median width'),
    }));
  });

  it('rejects median reservations without a positive width and opposite avenue lane pairs', () => {
    const invalid: ((profile: RoadProfile) => void)[] = [
      profile => { profile.median!.width = 0; },
      profile => { profile.lanes[1].direction = 'forward'; },
      profile => { profile.lanes.forEach(lane => { lane.direction = 'forward'; }); },
    ];
    for (const change of invalid) {
      const input = districtStreetDesign();
      const avenue = input.profiles.find(profile => profile.classes.includes('road'))!;
      avenue.median = { width: 3.4 };
      const city = plan(input);
      change(avenue);
      expect(() => resolveStreetDesign(input)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
      Object.assign(city.streets.edges[0].crossSection!, { median: avenue.median, lanes: avenue.lanes });
      expect(() => validateStreetSections(city)).toThrowError(expect.objectContaining({
        code: 'E_INVARIANT', message: expect.stringContaining('invalid median reservation'),
      }));
    }
    const street = districtStreetDesign();
    street.profiles.find(profile => profile.classes.includes('street'))!.median = { width: 3.4 };
    expect(() => resolveStreetDesign(street)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  });
});
