import { describe, expect, it } from 'vitest';
import { hasInteriorBeyondPrecision, precisionInterior } from './clip';
import { signedArea } from './polygon';
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
    for (const wedge of wedges) {
      expect(hasInteriorBeyondPrecision([wedge])).toBe(false);
      expect(precisionInterior([wedge])).toEqual([]);
    }
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
    expect(precisionInterior(pieces)).not.toEqual([]);
    expect(precisionInterior(pieces, 0.002)).toEqual([]);
  });

  it('localizes the thick end of a tapering obstruction without snapping its diagnostic core', () => {
    const wedge: Polygon = [[0, 0], [100, 0], [0, 0.0011]];
    const original = structuredClone(wedge);
    const core = precisionInterior([wedge]);
    const vertices = core.flat();
    expect(core.length > 0).toBe(hasInteriorBeyondPrecision([wedge]));
    expect(Math.min(...vertices.map(([x]) => x))).toBeCloseTo(0.0005, 8);
    expect(Math.max(...vertices.map(([x]) => x))).toBeGreaterThan(8);
    expect(Math.max(...vertices.map(([x]) => x))).toBeLessThan(10);
    expect(vertices.some(([x, y]) => Math.round(x * 1000) !== x * 1000 || Math.round(y * 1000) !== y * 1000)).toBe(true);
    expect(wedge).toEqual(original);
  });

  it('retains nonzero-fill holes and accepts either source winding', () => {
    const outer = rectangle(0, 0, 10, 10);
    const hole = rectangle(3, 3, 4, 4).reverse();
    for (const region of [[outer, hole], [[...outer].reverse(), [...hole].reverse()]]) {
      const core = precisionInterior(region);
      expect(core.some((ring) => signedArea(ring) > 0)).toBe(true);
      expect(core.some((ring) => signedArea(ring) < 0)).toBe(true);
      expect(core.reduce((sum, ring) => sum + signedArea(ring), 0)).toBeCloseTo(9.999 ** 2 - 4.001 ** 2, 8);
      expect(core.length > 0).toBe(hasInteriorBeyondPrecision(region));
    }
    expect(precisionInterior([outer, [...outer].reverse()])).toEqual([]);
    expect(hasInteriorBeyondPrecision([outer, [...outer].reverse()])).toBe(false);
  });

  it.each([0, NaN])('rejects an invalid boundary width %s', (width) => {
    expect(() => hasInteriorBeyondPrecision([], width)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    expect(() => precisionInterior([], width)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });
});
