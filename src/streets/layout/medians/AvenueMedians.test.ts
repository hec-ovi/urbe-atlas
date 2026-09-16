import { expect, it } from 'vitest';
import { GridLayout } from '../GridLayout';
import { districtStreetDesign } from '../../construction/DistrictDesign';
import { ModuleGround } from '../../construction/modules/ModuleGround';
import { difference, intersection, union } from '../../../geom/clip';
import { area } from '../../../geom/polygon';
import { AvenueMedians } from './AvenueMedians';
import type { Polygon } from '../../../../schema/blueprint';

const sum = (rings: Polygon[]) => rings.reduce((value, ring) => value + area(ring), 0);

it('fits rounded islands and ornament anchors inside selected avenue reservations with complete disjoint ground', () => {
  const design = districtStreetDesign();
  const plan = GridLayout.plan({ seed: 'median-review', moduleFormat: 'district', size: { width: 500, depth: 500 },
    profiles: design.profiles, sideAt: () => ({ profile: design.sidewalkProfiles[0], finish: 'luxury-blue' }), diagonals: 'off' });
  const original = structuredClone(plan), result = AvenueMedians.build(plan);
  expect(plan).toEqual(original);
  expect(AvenueMedians.build(plan)).toEqual(result);
  expect(result.medians.length).toBeGreaterThan(0);
  const cover = ModuleGround.cover({ version: '1.0.0', format: 'district', definitions: result.definitions, placements: result.placements });
  for (const median of result.medians) {
    const fields = cover.filter(field => field.blockId === median.id).map(field => field.polygon);
    expect(sum(fields)).toBeCloseTo(area(median.footprint), 7);
    expect(sum(union(fields))).toBeCloseTo(sum(fields), 7);
    expect(difference(fields, [median.footprint])).toEqual([]);
    expect(difference([median.footprint], plan.roadway)).toEqual([]);
    expect(intersection([median.footprint], plan.blocks.map(block => block.outer))).toEqual([]);
    expect(median.ornaments.length).toBeGreaterThan(0);
    expect(result.frontages.filter(frontage => frontage.ownerId === median.id)).toHaveLength(2);
  }
  plan.edges.find(edge => edge.crossSection?.median)!.crossSection!.median!.width = 2;
  expect(() => AvenueMedians.build(plan)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
});
