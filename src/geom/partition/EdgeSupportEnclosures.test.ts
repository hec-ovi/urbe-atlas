import { describe, expect, it } from 'vitest';
import { edgeSupportEnclosures } from './EdgeSupportEnclosures';
import type { PartitionEdgeSupportInput } from './schema';

describe('numeric source-support enclosure contract', () => {
  it('uses tight endpoint bounds and zero-width constant coordinates', () => {
    expect(edgeSupportEnclosures({ from: [1, -.007], to: [2, -.007], encoding: 'authored-1mm' })).toEqual({
      from: { lower: [.9999999999999998, -.007], upper: [1.0000000000000002, -.007] },
      to: { lower: [1.9999999999999998, -.007], upper: [2.0000000000000004, -.007] },
    });
    expect(edgeSupportEnclosures({ from: [.007, -2], to: [.007, -1], encoding: 'authored-1mm' })).toEqual({
      from: { lower: [.007, -2.0000000000000004], upper: [.007, -1.9999999999999998] },
      to: { lower: [.007, -1.0000000000000002], upper: [.007, -.9999999999999998] },
    });
  });

  it('preserves reversal and outward bounds at translated coordinates without sharing input arrays', () => {
    const input: PartitionEdgeSupportInput = { from: [101, 201], to: [102, 202], encoding: 'authored-1mm' };
    const result = edgeSupportEnclosures(input);
    expect(result).toEqual({
      from: { lower: [100.99999999999999, 200.99999999999997], upper: [101.00000000000001, 201.00000000000003] },
      to: { lower: [101.99999999999999, 201.99999999999997], upper: [102.00000000000001, 202.00000000000003] },
    });
    expect(edgeSupportEnclosures({ ...input, from: input.to, to: input.from })).toEqual({ from: result.to, to: result.from });
    const before = structuredClone(result);
    result.from.lower[0] = 99;
    expect(edgeSupportEnclosures(input)).toEqual(before);
    expect(input.from).toEqual([101, 201]);
    expect(() => edgeSupportEnclosures({ ...input, from: [.0001, 0] })).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    expect(() => edgeSupportEnclosures({ ...input, encoding: 'binary' } as unknown as PartitionEdgeSupportInput))
      .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });
});
