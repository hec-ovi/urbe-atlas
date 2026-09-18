import { describe, expect, it } from 'vitest';
import type { Polygon, StreetEdge, Vec2 } from '../../../../schema/blueprint';
import { coordinateCover, GRID_STEP, hasInteriorBeyondPrecision, snapPoint } from '../../../geom/clip';
import { edgeMaskView } from '../../../geom/partition/EdgeMasks';
import { StreetCorridors } from '../../construction/StreetCorridors';
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

/** Every published interval places a complete footprint on allowed, unforbidden, unexcluded land. */
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
  it('bounds complete footprints over allowed land, shares prepared fields and rejects malformed input', () => {
    const allowance = GRID_STEP / Math.SQRT2;
    const separated = input({ allowed: [rectangle(0, 10, -5, 5), rectangle(20, 30, -5, 5)] });
    expectIntervals(separated, [{ from: 1.5, to: 8.5 + allowance }, { from: 21.5 - allowance, to: 28.5 }]);
    expectIntervals(input({ allowed: [[[0, -5], [30, -5], [30, 5], [17, 5], [17, 2], [13, 2], [13, 5], [0, 5]]] }),
      [{ from: 1.5, to: 11.5 + allowance }, { from: 18.5 - allowance, to: 28.5 }]);
    expect(CrossingIntervals.find(input({ width: 30 }))).toEqual([{ from: 15, to: 15 }]);

    const prepared = { ...separated, allowed: new FootprintRegions(separated.allowed) };
    const expected = CrossingIntervals.find(separated);
    separated.allowed.length = 0;
    expect(CrossingIntervals.find(prepared)).toEqual(expected);
    expect(CrossingIntervals.find(separated)).toEqual([]);

    for (const overrides of [{ allowed: [rectangle(100, 130, -5, 5)] }, { allowed: [rectangle(0, 2, -5, 5)] },
      { forbidden: [rectangle(0, 30, -5, 5)] }, { excluded: [rectangle(0, 30, -5, 5)] }, { width: 31 }]) {
      expect(CrossingIntervals.find(input(overrides))).toEqual([]);
    }
    for (const overrides of [{ a: [NaN, 0] }, { b: [0, 0] }, { width: 0 }, { width: Infinity },
      { width: Number.MIN_VALUE }, { sourceOffset: -1 }, { sourceOffset: Infinity }, { lateral: [4, -4] },
      { lateral: [0, Infinity] }, { allowed: null }, { allowed: [[[0, 0], [1, 0]]] },
      { forbidden: [[[0, 0], [1, 0], [2, 0]]] }, { excluded: null }]) {
      expect(() => CrossingIntervals.find(input(overrides as Partial<StationIntervalInput>)))
        .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    }
  });

  it('separates precision-only contact from a genuine intrusion for forbidden and excluded masks', () => {
    const sliver = rectangle(10, 20, 3.9995, 5);
    expect(CrossingIntervals.find(input({ forbidden: [sliver] }))).toEqual([{ from: 1.5, to: 28.5 }]);
    expectIntervals(input({ excluded: [sliver] }), [{ from: 1.5, to: 8.5 }, { from: 21.5, to: 28.5 }]);
    expectIntervals(input({ forbidden: [rectangle(10, 20, 3.998, 5)] }),
      [{ from: 1.5, to: 8.5005 }, { from: 21.4995, to: 28.5 }]);
    const tangent = input({ excluded: [rectangle(0, 30, 4, 5)] });
    expect(CrossingIntervals.find(tangent)).toEqual([{ from: 1.5, to: 28.5 }]);
    verifyFootprints(tangent);
    expectIntervals(input({ forbidden: [[[8, -8], [10, -8], [22, 8], [20, 8]]] }),
      [{ from: 1.5, to: 9.501 }, { from: 20.499, to: 28.5 }]);
  });

  it('retains metric stations on oblique bands and through encoded path offsets', () => {
    const a: Vec2 = [10, 20], b: Vec2 = [34, 52];
    const oblique = input({ a, b, allowed: [transform(rectangle(5, 35, -6, 6), a, b)] });
    const result = CrossingIntervals.find(oblique);
    expect(result).toHaveLength(1);
    expect(result[0].from).toBeGreaterThan(6.499);
    expect(result[0].from).toBeLessThanOrEqual(6.5);
    expect(result[0].to).toBeGreaterThanOrEqual(33.5);
    expect(result[0].to).toBeLessThan(33.501);
    verifyFootprints(oblique);

    const encoded = input({ a, b, sourceOffset: 2 ** 30,
      allowed: [transform(rectangle(0, 40, -6, 6), a, b)],
      excluded: [transform(rectangle(12, 20, -5, 1), a, b)] });
    expect(CrossingIntervals.find(encoded)).toHaveLength(2);
    verifyFootprints(encoded);

    expect(CrossingIntervals.find(input({ width: 30, sourceOffset: 2 ** 30 }))).toEqual([{ from: 15, to: 15 }]);
    expect(CrossingIntervals.find(input({ width: 30, sourceOffset: 2 ** 54 }))).toEqual([]);
  });

  it('proves coverage, overlap and exact enclosures against an immutable field', () => {
    const source: Polygon = [[0, 0], [10, 0], [10, 4], [0, 4]];
    const masks: Polygon[] = [[[0, 0.0006], [10, 0.0006], [10, 4], [0, 4]]];
    const field = new FootprintRegions(masks);
    expect(field.empty).toBe(false);
    expect(new FootprintRegions([]).empty).toBe(true);
    expect(FootprintRegions.covers(source, [])).toBe(false);
    expect(field.covers(source)).toBe(true);
    expect(FootprintRegions.covers(source, [[[0, 0.0008], [10, 0.0008], [10, 4], [0, 4]]])).toBe(false);
    expect(FootprintRegions.covers(source, [[[0, 0], [5, 0], [5, 4], [0, 4]], [[5, 0], [10, 0], [10, 4], [5, 4]]])).toBe(true);
    expect(FootprintRegions.covers(source, [[[0, 0], [10, 0], [10, 4], [6, 4], [6, 2], [4, 2], [4, 4], [0, 4]]])).toBe(false);

    const expected = FootprintRegions.inside(source, masks);
    const first = field.inside(source);
    expect(first).toEqual(expected);
    first[0][0][0] = 100;
    masks[0][1][0] = 1;
    expect(field.inside(source)).toEqual(expected);
    expect(field.covers(source)).toBe(true);
    expect(FootprintRegions.covers(source, masks)).toBe(false);
    expect(FootprintRegions.outside(source, [])).toEqual([source]);

    const boundary = new FootprintRegions([[[0, 3.9995], [10, 3.9995], [10, 5], [0, 5]]]);
    expect(boundary.overlapsArea(source)).toBe(true);
    expect(boundary.intersects(source)).toBe(false);
    const interior = new FootprintRegions([[[0, 3], [10, 3], [10, 5], [0, 5]]]);
    expect(interior.intersects(source)).toBe(true);
    expect(interior.overlapsArea([[20, 0], [30, 0], [30, 4], [20, 4]])).toBe(false);
    expect(interior.missing(source).length).toBeGreaterThan(0);

    const enclosures = interior.insideEnclosures(source);
    const boundaries = interior.inside(source);
    expect(enclosures).toHaveLength(boundaries.length);
    boundaries.forEach((ring, index) => ring.forEach(([x, z], vertex) => {
      const { lower, upper } = enclosures[index][vertex];
      expect(lower[0]).toBeLessThanOrEqual(x);
      expect(upper[0]).toBeGreaterThanOrEqual(x);
      expect(lower[1]).toBeLessThanOrEqual(z);
      expect(upper[1]).toBeGreaterThanOrEqual(z);
    }));

    const invalid: Polygon = [[0, 0], [1, 0], [2, 0]];
    for (const query of [() => FootprintRegions.covers(invalid, [source]),
      () => FootprintRegions.covers(source, [invalid]),
      () => FootprintRegions.covers(source, [source, [[100, 100], [104, 104], [100, 104], [103, 100]]])]) {
      expect(query).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    }
  });

  it('anchors the directed frame on canonical endpoints and subdivides one shared source edge', () => {
    const a: Vec2 = [10, 20], b: Vec2 = [34, 52];
    const frame = new StationFrame(a, b);
    expect(frame.length).toBe(40);
    expect(frame.u).toEqual([0.6, 0.8]);
    expect(frame.v).toEqual([-0.8, 0.6]);
    expect(frame.point(10, 2)).toEqual([14.4, 29.2]);
    expect(frame.project(frame.edgePoint(10, 2))).toBeCloseTo(10, 12);
    expect(frame.edgePoint(0, 2)).toEqual(snapPoint([a[0] + frame.v[0] * 2, a[1] + frame.v[1] * 2]));
    expect(frame.edgePoint(frame.length, 2)).toEqual(snapPoint([b[0] + frame.v[0] * 2, b[1] + frame.v[1] * 2]));
    frame.edgePoint(0, 2)[0] = 999;
    expect(frame.edgePoint(0, 2)).toEqual([8.4, 21.2]);
    expect(a).toEqual([10, 20]);
    const decimal = new StationFrame([0.1, 0.2], [0.3, 0.4]);
    expect(decimal.edgePoint(decimal.length / 10, 0)).toEqual([0.12, 0.22]);

    const path: Vec2[] = [[132.698, 720.685], [138, 672.125], [141.583, 649.454]];
    const edge: StreetEdge = { id: 'source', class: 'street', from: 'a', to: 'b', path, width: 7,
      sidewalk: { left: 6.5, right: 6.5 }, districtIds: [], level: 0,
      elevationProfile: [{ distance: 0, level: 0 }, { distance: 71.80097893291506, level: 0 }] };
    const ownRoad = StreetCorridors.reservations([edge]).edges[0].roadway;
    const strip = (bent: StationFrame, from: number, to: number): Polygon =>
      [bent.edgePoint(from, -3.5), bent.edgePoint(to, -3.5), bent.edgePoint(to, 3.5), bent.edgePoint(from, 3.5)];
    for (let i = 1; i < path.length; i++) {
      const bent = new StationFrame(path[i - 1], path[i]);
      const long = strip(bent, 0, bent.length);
      expect(hasInteriorBeyondPrecision(FootprintRegions.outside(long, ownRoad))).toBe(false);
      for (const station of [2, bent.length - 2]) {
        const field = strip(bent, station - 1.5, station + 1.5);
        expect(hasInteriorBeyondPrecision(FootprintRegions.outside(field, [long]))).toBe(false);
        for (const offset of [-1, 1]) {
          const stripe = strip(bent, station + offset - 0.25, station + offset + 0.25);
          expect(hasInteriorBeyondPrecision(FootprintRegions.outside(stripe, [field]))).toBe(false);
          expect(hasInteriorBeyondPrecision(FootprintRegions.outside(stripe, ownRoad))).toBe(false);
        }
      }
    }
  });
});
