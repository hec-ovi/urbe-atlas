import { describe, expect, it } from 'vitest';
import { numericSweepEnvelope } from './NumericSweep';
import { coversSegment } from './polygon';
import { edgePositionView } from './partition/EdgeMasks';
import { SourcePartition } from './partition/SourcePartition';
import type { NumericSweepInput, Polygon } from './schema';

describe('numeric sweep envelope', () => {
  it('encloses the final rounding outside an oblique binary source edge', () => {
    const input: NumericSweepInput = {
      sides: [{ from: [0, 0], to: [0.003, 0.007] }, { from: [0.001, 0], to: [0.004, 0.007] }],
      encoding: 'authored-1mm',
    };
    const source: Polygon = [input.sides[0].from, input.sides[0].to, input.sides[1].to, input.sides[1].from];
    const view = edgePositionView({ position: { ...input.sides[0], t: 0.7 }, encoding: input.encoding });
    expect(view).toEqual([0.0021, 0.0049]);
    expect(coversSegment(source, view, view)).toBe(false);
    const envelope = numericSweepEnvelope(input);
    expect(coversSegment(envelope.polygon, view, view)).toBe(true);
    const retained = SourcePartition.create({ id: 'envelope', source: envelope.polygon });
    expect(retained.covers('envelope', source)).toBe(true);
  });

  it('keeps constant coordinates exact and returns independent diagnostic copies', () => {
    const input: NumericSweepInput = {
      sides: [{ from: [0, 0.001], to: [16, 0.001] }, { from: [0, 0.002], to: [16, 0.002] }],
      encoding: 'authored-1mm',
    };
    const original = structuredClone(input), envelope = numericSweepEnvelope(input);
    expect(Math.min(...envelope.polygon.map(point => point[1]))).toBe(0.001);
    expect(Math.max(...envelope.polygon.map(point => point[1]))).toBe(0.002);
    for (const [index, side] of envelope.sides.entries()) {
      expect(side.from.lower[1]).toBe(input.sides[index].from[1]);
      expect(side.from.upper[1]).toBe(input.sides[index].from[1]);
      expect(side.to.lower[1]).toBe(input.sides[index].to[1]);
      expect(side.to.upper[1]).toBe(input.sides[index].to[1]);
    }
    const again = numericSweepEnvelope(input);
    expect(envelope).toEqual(again);
    envelope.polygon[0][0] = 99;
    envelope.sides[0].from.lower[0] = 99;
    expect(input).toEqual(original);
    expect(numericSweepEnvelope(input)).toEqual(again);
  });

  it('rejects off-grid sides and a zero-area source sweep', () => {
    expect(() => numericSweepEnvelope({
      sides: [{ from: [0.0001, 0], to: [1, 0] }, { from: [0, 1], to: [1, 1] }], encoding: 'authored-1mm',
    })).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    expect(() => numericSweepEnvelope({
      sides: [{ from: [0, 0], to: [1, 0] }, { from: [2, 0], to: [3, 0] }], encoding: 'authored-1mm',
    })).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });
});
