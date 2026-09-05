import { describe, expect, it } from 'vitest';
import { segmentVisitsGridCell } from './clip';
import type { Vec2 } from './schema';

describe('segment contact with one owned grid cell', () => {
  it('includes lower corner contact and excludes upper corner contact in either direction', () => {
    const cases: [Vec2, Vec2, boolean][] = [
      [[-0.001, 0], [0, -0.001], true],
      [[0.001, 0], [0, 0.001], false],
      [[-0.001, 0], [0, 0.001], false],
      [[0, -0.001], [0.001, 0], false],
      [[-0.002, -0.001], [0.002, 0.001], true],
    ];
    for (const [a, b, expected] of cases) {
      expect(segmentVisitsGridCell(a, b, [0, 0])).toBe(expected);
      expect(segmentVisitsGridCell(b, a, [0, 0])).toBe(expected);
    }
  });

  it('keeps negative-coordinate ownership and rejects a near diagonal outside the cell', () => {
    expect(segmentVisitsGridCell([-0.011, -0.02], [-0.01, -0.021], [-0.01, -0.02])).toBe(true);
    expect(segmentVisitsGridCell([-0.009, -0.02], [-0.01, -0.019], [-0.01, -0.02])).toBe(false);
    // This line comes within 0.6 mm of the centre but never enters its cell.
    expect(segmentVisitsGridCell([-0.006, 0], [0.004, 0.001], [0, 0])).toBe(false);
    expect(segmentVisitsGridCell([0, 0], [0, 0], [0, 0])).toBe(true);
    expect(segmentVisitsGridCell([0.001, 0], [0.001, 0], [0, 0])).toBe(false);
  });
});
