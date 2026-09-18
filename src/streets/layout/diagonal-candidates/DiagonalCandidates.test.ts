import { expect, it } from 'vitest';
import type { Polygon } from '../../../../schema/blueprint';
import { DiagonalCandidates } from './DiagonalCandidates';
import type { DiagonalCandidateInput } from './schema';

const rectangle = (x: number, z: number, width: number, depth: number): Polygon =>
  [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]];
const input = (): DiagonalCandidateInput => ({
  rectangles: [
    { id: 'lower-parent', min: [0, 0], max: [100, 80] },
    { id: 'upper-parent', min: [0, 80], max: [100, 120] },
  ],
  facePairs: [{ id: 'lower-to-upper-junction',
    from: { rectangleId: 'lower-parent', side: 'south', streetId: 'lower-horizontal' },
    to: { rectangleId: 'upper-parent', side: 'south', streetId: 'upper-junction-horizontal' } }],
  constructionWidth: 8,
  allowedRegions: [rectangle(0, 0, 100, 120)],
});

it('proposes independent full-width cuts between authored parallel and perpendicular faces', () => {
  const source = input(), before = structuredClone(source);
  const candidates = DiagonalCandidates.plan(source);
  expect(candidates.map(candidate => [candidate.angle, candidate.slope])).toEqual([[45, 1], [45, -1]]);
  for (const candidate of candidates) {
    expect(candidate.centerline).toHaveLength(2);
    expect(candidate.footprint).toHaveLength(4);
    expect(candidate.mouths.map(mouth => mouth.streetId)).toEqual(['lower-horizontal', 'upper-junction-horizontal']);
    const [start, end] = candidate.centerline;
    expect(Math.abs(end[0] - start[0])).toBeCloseTo(80);
    expect([start[1], end[1]]).toEqual([0, 80]);
    for (const mouth of candidate.mouths) {
      expect(mouth.cornerClearances.every(distance => distance >= 3)).toBe(true);
      expect(mouth.points[1][0] - mouth.points[0][0]).toBeCloseTo(8 * Math.sqrt(2));
    }
  }
  expect(source).toEqual(before);
  expect(DiagonalCandidates.plan(source)).toEqual(candidates);
  candidates[0].mouths[0].points[0][0] = -999;
  expect(source).toEqual(before);
  source.rectangles[1] = { id: 'upper-parent', min: [0, 40], max: [100, 120] };
  expect(new Set(DiagonalCandidates.plan(source).map(candidate => candidate.angle))).toEqual(new Set([30, 45]));

  const perpendicular = input();
  perpendicular.facePairs[0].to = { rectangleId: 'lower-parent', side: 'east', streetId: 'vertical' };
  const clipped = DiagonalCandidates.plan(perpendicular);
  expect(clipped.map(candidate => [candidate.angle, candidate.slope])).toEqual([[30, 1], [45, 1]]);
  for (const candidate of clipped) {
    expect(candidate.mouths[0].points.every(point => point[1] === 0)).toBe(true);
    expect(candidate.mouths[1].points.every(point => point[0] === 100)).toBe(true);
    expect(candidate.mouths.every(mouth => mouth.cornerClearances.every(distance => distance >= 3))).toBe(true);
    const [start, end] = candidate.centerline;
    expect(Math.atan2(end[1] - start[1], end[0] - start[0]) * 180 / Math.PI).toBeCloseTo(candidate.angle);
  }
});

it('checks full intermediate mouths in traversal order and drops unreachable midpoints', () => {
  const source = input();
  source.rectangles.push({ id: 'intermediate', min: [0, 40], max: [100, 45] });
  source.facePairs[0].through = ['south', 'north'].map(side => ({ rectangleId: 'intermediate',
    side: side as 'south' | 'north', streetId: 'shared-street' }));
  const candidates = DiagonalCandidates.plan(source);
  expect(candidates).toHaveLength(2);
  expect(candidates.every(candidate => candidate.intermediateMouths.length === 2
    && candidate.intermediateMouths.every(mouth => mouth.cornerClearances.every(distance => distance >= 3)))).toBe(true);
  source.facePairs[0].through.reverse();
  expect(DiagonalCandidates.plan(source)).toEqual([]);

  for (const change of [
    (value: DiagonalCandidateInput) => { value.constructionWidth = 12; },
    (value: DiagonalCandidateInput) => { value.cornerClearance = 5; },
    (value: DiagonalCandidateInput) => { value.facePairs[0].to = { ...value.facePairs[0].from }; },
    (value: DiagonalCandidateInput) => { value.allowedRegions = [rectangle(0, 0, 100, 40), rectangle(0, 40.000001, 100, 79.999999)]; },
    (value: DiagonalCandidateInput) => { value.allowedRegions = [rectangle(0, 0, 100, 39), rectangle(0, 41, 100, 79),
      rectangle(0, 39, 49, 2), rectangle(51, 39, 49, 2)]; },
    (value: DiagonalCandidateInput) => { value.allowedRegions = []; },
  ]) {
    const infeasible = input(); change(infeasible);
    expect(DiagonalCandidates.plan(infeasible)).toEqual([]);
  }
});

it('rejects invalid identities, dimensions, angles and allowed rings at the public entry', () => {
  for (const change of [
    (value: DiagonalCandidateInput) => { value.rectangles.push(value.rectangles[0]); },
    (value: DiagonalCandidateInput) => { value.facePairs[0].from.rectangleId = 'missing'; },
    (value: DiagonalCandidateInput) => { value.facePairs[0].to.streetId = ''; },
    (value: DiagonalCandidateInput) => { value.constructionWidth = 0; },
    (value: DiagonalCandidateInput) => { value.cornerClearance = -1; },
    (value: DiagonalCandidateInput) => { value.angles = [60 as 30]; },
    (value: DiagonalCandidateInput) => { value.rectangles[0].min = [NaN, 0]; },
    (value: DiagonalCandidateInput) => { value.allowedRegions = [[[0, 0], [2, 2], [0, 2], [2, 0]]]; },
  ]) {
    const source = input(); change(source);
    expect(() => DiagonalCandidates.plan(source)).toThrow(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  }
});
