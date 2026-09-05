import { describe, expect, it } from 'vitest';
import { coversPath, coversSegment } from './polygon';
import type { Polygon, Vec2 } from './schema';

const courtyard: Polygon = [
  [0, 0], [8, 0], [8, 8], [6, 8], [5, 6], [5, 3], [3, 3], [3, 6], [2, 8], [0, 8],
];

describe('whole segment coverage', () => {
  it('rejects excursions through a concavity even when crossings meet boundary vertices', () => {
    const a: Vec2 = [1, 6], b: Vec2 = [7, 6];
    expect(coversSegment(courtyard, a, a)).toBe(true);
    expect(coversSegment(courtyard, b, b)).toBe(true);
    expect(coversSegment(courtyard, a, b)).toBe(false);
    expect(coversSegment(courtyard, [1, 5], [7, 5])).toBe(false);
    expect(coversSegment(courtyard, [2, 8], [6, 8])).toBe(false);
  });

  it('includes complete boundary runs and inward tangencies in either winding', () => {
    const cases: [Vec2, Vec2][] = [
      [[0, 0], [8, 0]], [[1, 3], [7, 3]], [[1, 5], [5, 1]], [[3, 3], [1, 5]],
    ];
    const original = structuredClone(courtyard);
    for (const [a, b] of cases) {
      expect(coversSegment(courtyard, a, b)).toBe(true);
      expect(coversSegment([...courtyard].reverse(), b, a)).toBe(true);
    }
    expect(courtyard).toEqual(original);
    const collinear: Polygon = [[0, 0], [4, 0], [8, 0], [8, 4], [0, 4]];
    expect(coversSegment(collinear, [1, 0], [7, 0])).toBe(true);
  });

  it('distinguishes represented coordinates without snapping or a distance allowance', () => {
    const e = Number.EPSILON;
    const triangle: Polygon = [[0, 0], [2, 2 + 2 * e], [0, 4]];
    const boundary: Vec2 = [1, 1 + e], outside: Vec2 = [1 + e, 1 + 2 * e];
    expect(coversSegment(triangle, boundary, boundary)).toBe(true);
    expect(coversSegment(triangle, outside, outside)).toBe(false);
    const narrowNotch: Polygon = [[0, 0], [8, 0], [8, 8], [4 + 1e-10, 8], [4 + 1e-10, 3], [4, 3], [4, 8], [0, 8]];
    expect(coversSegment(narrowNotch, [1, 6], [7, 6])).toBe(false);
  });

  it('covers every consecutive path segment and defines empty and point paths', () => {
    expect(coversPath(courtyard, [[1, 6], [1, 1], [7, 1], [7, 6]])).toBe(true);
    expect(coversPath(courtyard, [[1, 1], [1, 6], [7, 6]])).toBe(false);
    expect(coversPath(courtyard, [])).toBe(false);
    expect(coversPath(courtyard, [[3, 3]])).toBe(true);
    expect(coversPath(courtyard, [[4, 6]])).toBe(false);
  });
});
