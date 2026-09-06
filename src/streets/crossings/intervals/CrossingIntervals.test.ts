import { describe, expect, it } from 'vitest';
import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { coordinateCover, GRID_STEP, hasInteriorBeyondPrecision } from '../../../geom/clip';
import { edgeMaskView } from '../../../geom/partition/EdgeMasks';
import { CrossingIntervals } from './CrossingIntervals';
import { FootprintRegions } from './FootprintRegions';
import { StationFrame } from './StationFrame';
import type { StationInterval, StationIntervalInput } from './schema';

function rectangle(from: number, to: number, min: number, max: number): Polygon {
  return [[from, min], [to, min], [to, max], [from, max]];
}

function input(overrides: Partial<StationIntervalInput> = {}): StationIntervalInput {
  return { a: [0, 0], b: [30, 0], width: 3, lateral: [-4, 4],
    allowed: [rectangle(0, 30, -5, 5)], ...overrides };
}

function transform(polygon: Polygon, a: Vec2, b: Vec2): Polygon {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / length, uz = (b[1] - a[1]) / length;
  return polygon.map(([station, lateral]) =>
    [a[0] + ux * station - uz * lateral, a[1] + uz * station + ux * lateral]);
}

function verifyFootprints(query: StationIntervalInput): void {
  const before = JSON.stringify(query);
  const result = CrossingIntervals.find(query);
  expect(CrossingIntervals.find(query)).toEqual(result);
  expect(JSON.stringify(query)).toBe(before);
  const frame = new StationFrame(query.a, query.b);
  for (const interval of result) {
    for (const candidate of [interval.from, (interval.from + interval.to) / 2, interval.to]) {
      const offset = query.sourceOffset ?? 0;
      const station = (offset + candidate) - offset;
      const from = station - query.width / 2, to = station + query.width / 2;
      expect(from).toBeGreaterThanOrEqual(0);
      expect(to).toBeLessThanOrEqual(frame.length);
      const position = (distance: number, lateral: number) => ({ from: frame.edgePoint(0, lateral),
        to: frame.edgePoint(frame.length, lateral), t: distance / frame.length });
      const footprint = edgeMaskView({ encoding: 'authored-1mm', mask: [
        position(from, query.lateral[0]), position(to, query.lateral[0]),
        position(to, query.lateral[1]), position(from, query.lateral[1]),
      ] });
      expect(FootprintRegions.outside(footprint, coordinateCover(query.allowed))).toEqual([]);
      expect(hasInteriorBeyondPrecision(FootprintRegions.inside(footprint, query.forbidden ?? []))).toBe(false);
      expect(FootprintRegions.inside(footprint, query.excluded ?? [])).toEqual([]);
    }
  }
}

function expectIntervals(query: StationIntervalInput, expected: StationInterval[]): void {
  const actual = CrossingIntervals.find(query);
  expect(actual).toHaveLength(expected.length);
  expected.forEach((interval, index) => {
    expect(actual[index].from).toBeCloseTo(interval.from, 10);
    expect(actual[index].to).toBeCloseTo(interval.to, 10);
  });
  verifyFootprints(query);
}

describe('CrossingIntervals public full-band query', () => {
  it('shares exact field inputs across interval queries without changing their bounds', () => {
    const query = input({ allowed: [rectangle(0, 10, -5, 5), rectangle(20, 30, -5, 5)],
      forbidden: [rectangle(1, 3, -5, 5)], excluded: [rectangle(25, 27, -5, 5)] });
    const prepared = { ...query, allowed: new FootprintRegions(query.allowed),
      forbidden: new FootprintRegions(query.forbidden!), excluded: new FootprintRegions(query.excluded!) };
    const expected = CrossingIntervals.find(query);
    expect(CrossingIntervals.find(prepared)).toEqual(expected);
    query.allowed.length = 0;
    expect(CrossingIntervals.find(prepared)).toEqual(expected);
    expect(CrossingIntervals.find(query)).toEqual([]);
  });

  it('fits an oblique full footprint and retains metric stations', () => {
    const a: Vec2 = [10, 20], b: Vec2 = [34, 52];
    const query = input({ a, b, allowed: [transform(rectangle(5, 35, -6, 6), a, b)] });
    const result = CrossingIntervals.find(query);
    expect(result).toHaveLength(1);
    expect(result[0].from).toBeGreaterThan(6.499);
    expect(result[0].from).toBeLessThanOrEqual(6.5);
    expect(result[0].to).toBeGreaterThanOrEqual(33.5);
    expect(result[0].to).toBeLessThan(33.501);
    verifyFootprints(query);
  });

  it('bounds stations through the canonical oblique source edges', () => {
    const a: Vec2 = [0.000499, 0.000499], b: Vec2 = [100, 100];
    const frame = new StationFrame(a, b);
    const allowed = [[frame.edgePoint(8, 0), frame.edgePoint(frame.length, 0),
      frame.edgePoint(frame.length, 7), frame.edgePoint(0, 7),
      frame.edgePoint(0, 1), frame.edgePoint(8, 1)]];
    const query = input({ a, b, lateral: [0, 7], allowed });
    expect(CrossingIntervals.find(query)).toHaveLength(1);
    verifyFootprints(query);
  });

  it('bounds cancellation when a source path offset encodes a local station', () => {
    const query = input({ sourceOffset: 2 ** 30, allowed: [rectangle(5, 25, -5, 5)] });
    expect(CrossingIntervals.find(query)).toHaveLength(1);
    verifyFootprints(query);
  });

  it('retains exact source-cap fits only when the path encoding can represent their centre', () => {
    const exact = input({ width: 30, sourceOffset: 2 ** 30 });
    expect(CrossingIntervals.find(exact)).toEqual([{ from: 15, to: 15 }]);
    verifyFootprints(exact);
    expect(CrossingIntervals.find(input({ width: 30, sourceOffset: 2 ** 54 }))).toEqual([]);
  });

  it('returns both separated valid intervals without spanning missing land', () => {
    const query = input({ allowed: [rectangle(0, 10, -5, 5), rectangle(20, 30, -5, 5)] });
    const allowance = GRID_STEP / Math.SQRT2;
    expectIntervals(query, [{ from: 1.5, to: 8.5 + allowance }, { from: 21.5 - allowance, to: 28.5 }]);
  });

  it('rejects a concave missing-land cut that leaves the centreline intact', () => {
    const query = input({ allowed: [[[0, -5], [30, -5], [30, 5], [17, 5],
      [17, 2], [13, 2], [13, 5], [0, 5]]] });
    const allowance = GRID_STEP / Math.SQRT2;
    expectIntervals(query, [{ from: 1.5, to: 11.5 + allowance }, { from: 18.5 - allowance, to: 28.5 }]);
  });

  it('excludes the full station range of an oblique transverse lane intrusion', () => {
    const query = input({ forbidden: [[[8, -8], [10, -8], [22, 8], [20, 8]]] });
    expectIntervals(query, [{ from: 1.5, to: 9.501 }, { from: 20.499, to: 28.5 }]);
  });

  it('returns no interval when no whole footprint fits', () => {
    expect(CrossingIntervals.find(input({ allowed: [] }))).toEqual([]);
    expect(CrossingIntervals.find(input({ allowed: [rectangle(100, 130, -5, 5)] }))).toEqual([]);
    expect(CrossingIntervals.find(input({ allowed: [rectangle(0, 2, -5, 5)] }))).toEqual([]);
    expect(CrossingIntervals.find(input({ forbidden: [rectangle(0, 30, -5, 5)] }))).toEqual([]);
    expect(CrossingIntervals.find(input({ excluded: [rectangle(0, 30, -5, 5)] }))).toEqual([]);
    expect(CrossingIntervals.find(input({ width: 31 }))).toEqual([]);
  });

  it('retains exact fits between tangent blockers and at both segment ends', () => {
    const query = input({ forbidden: [rectangle(0, 13.5, -5, 5), rectangle(16.5, 30, -5, 5)] });
    expectIntervals(query, [{ from: 14.9995, to: 15.0005 }]);
    expect(CrossingIntervals.find(input({ width: 30 }))).toEqual([{ from: 15, to: 15 }]);
  });

  it('keeps a boundary-only one-grid-cell sliver at the declared precision', () => {
    const query = input({ forbidden: [rectangle(10, 20, 3.999, 5)] });
    expect(CrossingIntervals.find(query)).toEqual([{ from: 1.5, to: 28.5 }]);
    verifyFootprints(query);
  });

  it('blocks a genuine intrusion wider than the declared precision', () => {
    const query = input({ forbidden: [rectangle(10, 20, 3.998, 5)] });
    expectIntervals(query, [{ from: 1.5, to: 8.5005 }, { from: 21.4995, to: 28.5 }]);
  });

  it('keeps complete fields outside intersecting source traffic at an axis contact', () => {
    const query = input({ a: [100, 0], b: [200, 0], lateral: [-3.5, 3.5],
      allowed: [rectangle(100, 200, -3.5, 3.5)],
      excluded: [rectangle(96.5, 103.5, 0, 100)] });
    const intervals = CrossingIntervals.find(query);
    expect(intervals).toHaveLength(1);
    expect(intervals[0].from).toBeGreaterThanOrEqual(5);
    expect(intervals[0].from).toBeLessThan(5.000001);
    verifyFootprints(query);
  });

  it('distinguishes exact exclusions from precision-only boundary slivers', () => {
    const sliver = rectangle(10, 20, 3.9995, 5);
    const query = input({ excluded: [sliver], forbidden: [rectangle(0, 30, -5, -3.9995)] });
    expectIntervals(query, [{ from: 1.5, to: 8.5 }, { from: 21.5, to: 28.5 }]);
    expect(CrossingIntervals.find(input({ forbidden: [sliver] }))).toEqual([{ from: 1.5, to: 28.5 }]);
    const tangent = input({ excluded: [rectangle(0, 30, 4, 5)] });
    expect(CrossingIntervals.find(tangent)).toEqual([{ from: 1.5, to: 28.5 }]);
    verifyFootprints(tangent);
  });

  it('bounds exact oblique exclusions through encoded path stations', () => {
    const a: Vec2 = [10, 20], b: Vec2 = [34, 52];
    const query = input({ a, b, sourceOffset: 2 ** 30,
      allowed: [transform(rectangle(0, 40, -6, 6), a, b)],
      excluded: [transform(rectangle(12, 20, -5, 1), a, b)] });
    expect(CrossingIntervals.find(query)).toHaveLength(2);
    verifyFootprints(query);
  });

  it('rejects a terminal 0.768 mm outside its allowed source edge', () => {
    const query = input({ lateral: [-3.5, 3.5], allowed: [rectangle(0, 30, -3.499232, 3.5)] });
    expect(CrossingIntervals.find(query)).toEqual([]);
  });

  it('rejects a thin long missing spike even when its width has no precision interior', () => {
    const query = input({ b: [100, 0], lateral: [0, 0.001], allowed: [rectangle(0, 10, -1, 1)] });
    const intervals = CrossingIntervals.find(query);
    expect(intervals).toHaveLength(1);
    expect(intervals[0].from).toBe(1.5);
    expect(intervals[0].to).toBeGreaterThan(8.5);
    expect(intervals[0].to).toBeLessThan(8.501);
    verifyFootprints(query);
  });

  it('retains nearby allowed sources whose coordinate covers reach the full band', () => {
    const query = input({ lateral: [0, 0.001],
      allowed: [rectangle(0, 30, -1, -0.0001), rectangle(0, 30, 0.0011, 1)] });
    expect(CrossingIntervals.find(query)).toEqual([{ from: 1.5, to: 28.5 }]);
    verifyFootprints(query);
  });

  it('permits the covered tail of a missing wedge with a genuine intrusion at its head', () => {
    const query = input({ b: [100, 0], lateral: [-3.5, 3.5],
      allowed: [[[0, -3.4989], [100, -3.5], [100, 3.5], [0, 3.5]]] });
    const frame = new StationFrame(query.a, query.b);
    const missingAt = (station: number) => {
      const from = station - query.width / 2, to = station + query.width / 2;
      const field = [frame.edgePoint(from, -3.5), frame.edgePoint(to, -3.5),
        frame.edgePoint(to, 3.5), frame.edgePoint(from, 3.5)];
      return FootprintRegions.outside(field, coordinateCover(query.allowed));
    };
    expect(missingAt(1.5)).not.toEqual([]);
    expect(missingAt(75)).toEqual([]);
    const intervals = CrossingIntervals.find(query);
    expect(intervals.some(interval => interval.from <= 75 && interval.to >= 75)).toBe(true);
    expect(intervals.some(interval => interval.from <= 1.5 && interval.to >= 1.5)).toBe(false);
    verifyFootprints(query);
  });

  it('preserves directed asymmetric bands and ignores unrelated obstacles', () => {
    const query = input({ a: [30, 0], b: [0, 0], lateral: [2, 6],
      allowed: [rectangle(0, 30, -7, -1)], forbidden: [rectangle(0, 30, 1, 7)] });
    expect(CrossingIntervals.find(query)).toEqual([{ from: 1.5, to: 28.5 }]);
    verifyFootprints(query);
  });

  it('preserves a shared oblique source seam through a short published footprint query', () => {
    const a: Vec2 = [116.439, 592.546], b: Vec2 = [149.67, 598.289];
    const seam: Vec2 = [136.778, 596.06];
    const allowed: Polygon[] = [[a, [90, 550], [180, 550], [180, 590], b, seam],
      [a, b, [180, 650], [90, 650], [90, 610]]];
    const query = input({ a, b, lateral: [-10.5, 10.5], allowed });
    const station = 5.000482064290629;
    const field: Polygon = [[121.676, 582.795], [124.633, 583.306], [121.056, 604], [118.1, 603.489]];
    const intervals = CrossingIntervals.find(query);
    expect(intervals.some(interval => interval.from <= station && interval.to >= station)).toBe(true);
    const before = JSON.stringify({ field, allowed });
    const missing = FootprintRegions.outside(field, allowed);
    expect(missing).toHaveLength(1);
    expect(hasInteriorBeyondPrecision(missing)).toBe(false);
    expect(hasInteriorBeyondPrecision(FootprintRegions.inside(field, [[a, seam, b]]))).toBe(false);
    expect(FootprintRegions.outside(field, allowed)).toEqual(missing);
    expect(JSON.stringify({ field, allowed })).toBe(before);
    verifyFootprints(query);
  });

  it('preserves real missing and forbidden regions in source-accurate queries', () => {
    const field = rectangle(0, 3, -4, 4);
    const mask = rectangle(0, 3, 3.998, 5);
    expect(hasInteriorBeyondPrecision(FootprintRegions.inside(field, [mask]))).toBe(true);
    expect(hasInteriorBeyondPrecision(FootprintRegions.outside(field, [rectangle(0, 3, -4, 3.998)]))).toBe(true);
    expect(FootprintRegions.inside(field, [])).toEqual([]);
    expect(FootprintRegions.outside(field, [])).toEqual([field]);
    expect(() => FootprintRegions.outside([[0, 0], [1, 0], [2, 0]], [mask]))
      .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });

  it('rejects malformed public inputs with the declared error', () => {
    for (const overrides of [
      { a: [NaN, 0] }, { b: [0, 0] }, { width: 0 }, { width: Infinity }, { width: Number.MIN_VALUE },
      { sourceOffset: -1 }, { sourceOffset: Infinity },
      { lateral: [4, -4] }, { lateral: [0, Infinity] }, { allowed: null },
      { allowed: [[[0, 0], [1, 0]]] }, { forbidden: [[[0, 0], [1, 0], [2, 0]]] },
      { excluded: null }, { excluded: [[[0, 0], [1, 0], [2, 0]]] },
    ]) {
      expect(() => CrossingIntervals.find(input(overrides as Partial<StationIntervalInput>)))
        .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    }
  });
});
