import { describe, expect, it } from 'vitest';
import { coordinateCover, GRID_STEP, hasInteriorBeyondPrecision } from './clip';
import { SourcePartition } from './partition/SourcePartition';
import type { Polygon } from './schema';

const rectangle = (left: number, bottom: number, right: number, top: number): Polygon => [
  [left, bottom], [right, bottom], [right, top], [left, top],
];

function covered(subject: Polygon, masks: Polygon[]): boolean {
  const partition = SourcePartition.create({ id: 'subject', source: subject });
  partition.divide('subject', { claims: [{ id: 'covered', masks }], remainderId: 'outside' });
  return partition.loops('outside').length === 0;
}

describe('coordinate coverage masks', () => {
  it('permits bounded straight-edge uncertainty and rejects the 0.768 mm intrusion', () => {
    const masks = coordinateCover([rectangle(0, 0, 10, 10)]);
    const allowance = GRID_STEP / Math.SQRT2;
    expect(covered(rectangle(2, 2, 8, 10 + allowance), masks)).toBe(true);
    expect(covered(rectangle(2, 2, 8, 10.000768), masks)).toBe(false);
    expect(covered(rectangle(2, 2, 8, 10.000768), coordinateCover([rectangle(0, 0, 10, 10)], 0.002))).toBe(true);
  });

  it('rejects a deep thin spike even when its missing region has no precision interior', () => {
    const land = rectangle(0, 0, 10, 10);
    const spike: Polygon = [[4, 9], [6, 9], [6, 10], [5.0001, 10], [5.0001, 12], [5, 12], [5, 10], [4, 10]];
    expect(hasInteriorBeyondPrecision([rectangle(5, 10, 5.0001, 12)])).toBe(false);
    expect(covered(spike, coordinateCover([land]))).toBe(false);
  });

  it('preserves both source windings, sub-grid coordinates and caller ownership', () => {
    const source = rectangle(0.000123, 0.000234, 4.000123, 3.000234);
    const original = structuredClone(source);
    const forwards = coordinateCover([source]), backwards = coordinateCover([[...source].reverse()]);
    expect(forwards[0]).toEqual(original);
    expect(backwards[0]).toEqual(original);
    expect(covered(rectangle(1, 1, 2, 3.0008), forwards)).toBe(true);
    expect(covered(rectangle(1, 1, 2, 3.0008), backwards)).toBe(true);
    forwards[0][0][0] = 99;
    expect(source).toEqual(original);
    expect(backwards[0]).toEqual(original);
    expect(coordinateCover([source])).toEqual(coordinateCover([source]));
  });

  it('fills bevel joins without bridging a concave notch or a gap between source pieces', () => {
    const concave: Polygon = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]];
    const masks = coordinateCover([concave, rectangle(5, 0, 8, 3)]);
    expect(covered(rectangle(-0.0002, -0.0002, 0.5, 0.5), masks)).toBe(true);
    expect(covered(rectangle(1, 1, 1.0006, 1.0006), masks)).toBe(true);
    expect(covered(rectangle(1, 1, 1.001, 1.001), masks)).toBe(false);
    expect(covered(rectangle(2, 0.2, 6, 0.8), masks)).toBe(false);
    expect(coordinateCover([])).toEqual([]);
  });

  it('retains positive-area masks when a short source edge has coincident shifted endpoints', () => {
    const source: Polygon = [
      [1.9999999999999996, -1.9999999999999998],
      [1.9999999999999998, -1.9999999999999996],
      [1, -1],
    ];
    const masks = coordinateCover([source]);
    for (const [index, mask] of masks.entries()) {
      expect(mask.every((point, vertex) => {
        const next = mask[(vertex + 1) % mask.length];
        return point[0] !== next[0] || point[1] !== next[1];
      })).toBe(true);
      expect(() => SourcePartition.create({ id: String(index), source: mask })).not.toThrow();
    }
    expect(masks).toContainEqual([
      source[0], [2.0004999999999997, -2.0004999999999997], source[1],
    ]);
    expect(covered(source, masks)).toBe(true);
  });

  it('rejects invalid diagnostic dimensions and malformed rings', () => {
    expect(() => coordinateCover([], 0)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    expect(() => coordinateCover([[[0, 0], [1, NaN], [0, 1]]])).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    expect(() => coordinateCover([[[0, 0], [1, 0], [0, 0]]])).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });
});
