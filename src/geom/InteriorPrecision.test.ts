import { describe, expect, it } from 'vitest';
import { hasInteriorBeyondPrecision } from './clip';
import type { Polygon } from './schema';

const rectangle = (x: number, y: number, width: number, depth: number): Polygon => [
  [x, y], [x + width, y], [x + width, y + depth], [x, y + depth],
];

describe('interior beyond the coordinate boundary', () => {
  it('distinguishes reported precision wedges from real overlap without modifying geometry', () => {
    const wedges: Polygon[] = [
      [[1001.67, 834.57], [1002.968, 836.391], [1002.968, 836.392], [1001.1, 833.771]],
      [[175.953, 57.849], [174.959, 58.005], [179.864, 57.232]],
    ];
    const original = structuredClone(wedges);
    for (const wedge of wedges) expect(hasInteriorBeyondPrecision([wedge])).toBe(false);
    expect(wedges).toEqual(original);
    expect(hasInteriorBeyondPrecision([])).toBe(false);
    expect(hasInteriorBeyondPrecision([rectangle(0, 0, 5, 0.01)])).toBe(true);
    expect(hasInteriorBeyondPrecision([rectangle(0, 0, 10, 5)])).toBe(true);
    expect(hasInteriorBeyondPrecision([rectangle(0, 0, 5, 0.001)])).toBe(false);
    expect(hasInteriorBeyondPrecision([rectangle(0, 0, 5, 0.00101)])).toBe(true);
  });

  it('measures the union across partition seams and respects the supplied precision width', () => {
    const pieces = [rectangle(0, 0, 5, 0.00075), rectangle(0, 0.00075, 5, 0.00075)];
    expect(pieces.map((piece) => hasInteriorBeyondPrecision([piece]))).toEqual([false, false]);
    expect(hasInteriorBeyondPrecision(pieces)).toBe(true);
    expect(hasInteriorBeyondPrecision(pieces, 0.002)).toBe(false);
    expect(hasInteriorBeyondPrecision(pieces.map((piece) => piece.map(([x, y]) => [x + 1000, y + 1000])))).toBe(true);
  });

  it.each([0, NaN])('rejects an invalid boundary width %s', (width) => {
    expect(() => hasInteriorBeyondPrecision([], width)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });
});
