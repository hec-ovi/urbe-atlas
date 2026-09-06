import { describe, expect, it } from 'vitest';
import type { Polygon } from '../../../../schema/blueprint';
import { coordinateCover } from '../../../geom/clip';
import { FootprintRegions } from './FootprintRegions';

const source: Polygon = [[0, 0], [10, 0], [10, 4], [0, 4]];

describe('FootprintRegions complete coordinate coverage', () => {
  it('reuses an immutable field while every query owns its results', () => {
    const masks: Polygon[] = [[[0, 0.0006], [10, 0.0006], [10, 4], [0, 4]]];
    const field = new FootprintRegions(masks);
    const expected = FootprintRegions.inside(source, masks);
    expect(field.covers(source)).toBe(true);
    const first = field.inside(source);
    expect(first).toEqual(expected);
    first[0][0][0] = 100;
    masks[0][1][0] = 1;
    expect(field.inside(source)).toEqual(expected);
    expect(field.covers(source)).toBe(true);
    expect(FootprintRegions.covers(source, masks)).toBe(false);
    expect(field.covers([[20, 0], [30, 0], [30, 4], [20, 4]])).toBe(false);
  });

  it('proves the complete source against unions, gaps and precision-edge additions', () => {
    const cases: { allowed: Polygon[]; covered: boolean }[] = [
      { allowed: [], covered: false },
      { allowed: [[[0, 0], [5, 0], [5, 4], [0, 4]], [[5, 0], [10, 0], [10, 4], [5, 4]]], covered: true },
      { allowed: [[[0, 0], [10, 0], [10, 4], [6, 4], [6, 2], [4, 2], [4, 4], [0, 4]]], covered: false },
      { allowed: [[[0, 0.0006], [10, 0.0006], [10, 4], [0, 4]]], covered: true },
      { allowed: [[[0, 0.0008], [10, 0.0008], [10, 4], [0, 4]]], covered: false },
    ];
    for (const { allowed, covered } of cases) {
      const before = JSON.stringify({ source, allowed });
      expect(FootprintRegions.covers(source, allowed)).toBe(covered);
      expect(FootprintRegions.outside(source, coordinateCover(allowed)).length === 0).toBe(covered);
      expect(JSON.stringify({ source, allowed })).toBe(before);
    }
    const allowed = [structuredClone(source)];
    expect(FootprintRegions.covers(source, allowed)).toBe(true);
    allowed[0][1][0] = 1;
    expect(FootprintRegions.covers(source, allowed)).toBe(false);
  });

  it('rejects invalid source and allowed geometry with the declared error', () => {
    const invalid: Polygon = [[0, 0], [1, 0], [2, 0]];
    for (const query of [() => FootprintRegions.covers(invalid, [source]),
      () => FootprintRegions.covers(source, [invalid]),
      () => FootprintRegions.covers(source, [source, invalid.map(([x, y]) => [x + 100, y + 100])]),
      () => FootprintRegions.covers(source, [source, [[100, 100], [104, 104], [100, 104], [103, 100]]])]) {
      expect(query).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    }
  });
});
