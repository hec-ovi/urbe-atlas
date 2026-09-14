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

it('proposes independent full-width cuts between authored lower and upper receiving faces without changing the grid', () => {
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
});

it('rejects a corner-overlapping full mouth even when its centerline could clear both corners', () => {
  const source = input();
  source.constructionWidth = 12;
  expect(DiagonalCandidates.plan(source)).toEqual([]);
  source.constructionWidth = 8;
  source.cornerClearance = 5;
  expect(DiagonalCandidates.plan(source)).toEqual([]);
  source.facePairs[0].to = { ...source.facePairs[0].from };
  expect(DiagonalCandidates.plan(source)).toEqual([]);
});

it('clips the complete strip to perpendicular authored receiving faces', () => {
  const source = input();
  source.facePairs[0].to = { rectangleId: 'lower-parent', side: 'east', streetId: 'vertical' };
  const candidates = DiagonalCandidates.plan(source);
  expect(candidates.map(candidate => [candidate.angle, candidate.slope])).toEqual([[30, 1], [45, 1]]);
  for (const candidate of candidates) {
    expect(candidate.mouths[0].points.every(point => point[1] === 0)).toBe(true);
    expect(candidate.mouths[1].points.every(point => point[0] === 100)).toBe(true);
    expect(candidate.mouths.every(mouth => mouth.cornerClearances.every(distance => distance >= 3))).toBe(true);
    const [start, end] = candidate.centerline;
    expect(Math.atan2(end[1] - start[1], end[0] - start[0]) * 180 / Math.PI).toBeCloseTo(candidate.angle);
  }
});

it('requires complete allowed-land coverage across disconnected gaps and enclosed holes', () => {
  const source = input();
  source.allowedRegions = [rectangle(0, 0, 100, 40), rectangle(0, 40.000001, 100, 79.999999)];
  expect(DiagonalCandidates.plan(source)).toEqual([]);
  source.allowedRegions = [rectangle(0, 0, 100, 39), rectangle(0, 41, 100, 79),
    rectangle(0, 39, 49, 2), rectangle(51, 39, 49, 2)];
  expect(DiagonalCandidates.plan(source)).toEqual([]);
  source.allowedRegions = [];
  expect(DiagonalCandidates.plan(source)).toEqual([]);
});

it('checks full intermediate mouths in traversal order even when all allowed land is covered', () => {
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
  source.facePairs[0].through.reverse();
  source.rectangles[2].min[0] = 49;
  source.rectangles[2].max[0] = 51;
  expect(DiagonalCandidates.plan(source)).toEqual([]);
});

it('rejects invalid identities, dimensions, angles and allowed rings at the public entry', () => {
  const changes: ((source: DiagonalCandidateInput) => void)[] = [
    source => { source.rectangles.push(source.rectangles[0]); },
    source => { source.facePairs.push(source.facePairs[0]); },
    source => { source.facePairs[0].from.rectangleId = 'missing'; },
    source => { source.facePairs[0].to.streetId = ''; },
    source => { source.constructionWidth = 0; },
    source => { source.cornerClearance = -1; },
    source => { source.angles = [60 as 30]; },
    source => { source.rectangles[0].min = [NaN, 0]; },
    source => { source.allowedRegions = [[[0, 0], [2, 2], [0, 2], [2, 0]]]; },
  ];
  for (const change of changes) {
    const source = input(); change(source);
    expect(() => DiagonalCandidates.plan(source)).toThrow(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  }
});
