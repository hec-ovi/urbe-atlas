/** Geometry contract surface: one case per published entry, plus its closed error set. */
import { describe, expect, it } from 'vitest';
import { BoxPairs, boxOf, grow, overlaps } from './Boxes';
import {
  bufferLine, coordinateCover, difference, GRID_STEP, hasInteriorBeyondPrecision, intersection,
  offset, precisionInterior, segmentVisitsGridCell, snap, snapPoint, union, unionOnCorners,
} from './clip';
import { normalizePaths } from './SnapRounding';
import { numericSweepEnvelope } from './NumericSweep';
import { edgePositionView } from './partition/EdgeMasks';
import { SourcePartition } from './partition/SourcePartition';
import { area, coversPath, coversSegment, isSimpleRing, signedArea } from './polygon';
import type { GridPath, NumericSweepInput, Polygon, Vec2 } from './schema';
import { dist, segmentIntersection } from './vec';

const rectangle = (x: number, y: number, width: number, depth: number): Polygon => [
  [x, y], [x + width, y], [x + width, y + depth], [x, y + depth],
];
const box = (left: number, bottom: number, right: number, top: number): Polygon => [
  [left, bottom], [right, bottom], [right, top], [left, top],
];

// Two nearly parallel snapped boundaries cross in the middle of a 62 m side.
const sidewalk: Polygon = [
  [243.603, 248.782], [244.109, 249.012], [244.537, 249.368], [286.498, 295.025],
  [286.849, 295.553], [287.017, 296.148], [286.993, 296.771], [286.780, 297.354],
  [286.393, 297.849], [272.702, 310.651], [238.477, 341.428], [238.477, 335.579],
  [269.770, 307.439], [284.902, 293.289], [246.030, 250.992], [238.477, 258.409],
  [238.477, 252.310], [241.550, 249.293], [241.999, 248.958], [242.515, 248.754],
  [243.060, 248.695],
];
const courtyard: Polygon = [
  [0, 0], [8, 0], [8, 8], [6, 8], [5, 6], [5, 3], [3, 3], [3, 6], [2, 8], [0, 8],
];

const toGrid = (poly: Polygon): GridPath => poly.map(([x, y]) => ({ x: Math.round(x * 1000), y: Math.round(y * 1000) }));
const toPolygon = (path: GridPath): Polygon => path.map((p) => [p.x / 1000, p.y / 1000]);

/** Ignore the chosen first vertex and collection order, never geometry. */
function canonical(polygons: Polygon[]): string[] {
  return polygons.map((polygon) => {
    const points = signedArea(polygon) < 0 ? [...polygon].reverse() : polygon;
    let first = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i][0] < points[first][0] || (points[i][0] === points[first][0] && points[i][1] < points[first][1])) first = i;
    }
    return JSON.stringify([...points.slice(first), ...points.slice(0, first)]);
  }).sort();
}

const edgeKey = (a: Vec2, b: Vec2): string => [JSON.stringify(a), JSON.stringify(b)].sort().join(':');
const edges = (polygons: Polygon[]): Set<string> =>
  new Set(polygons.flatMap((polygon) => polygon.map((a, i) => edgeKey(a, polygon[(i + 1) % polygon.length]))));

function covered(subject: Polygon, masks: Polygon[]): boolean {
  const partition = SourcePartition.create({ id: 'subject', source: subject });
  partition.divide('subject', { claims: [{ id: 'covered', masks }], remainderId: 'outside' });
  return partition.loops('outside').length === 0;
}

describe('boolean region operations', () => {
  it('returns nonzero-fill CCW rings from union, difference, intersection, offset, buffer and snapping', () => {
    const left = rectangle(0, 0, 10, 10), right = rectangle(5, 0, 10, 10);
    const merged = union([left, right]);
    expect(merged).toHaveLength(1);
    expect(signedArea(merged[0])).toBeCloseTo(150, 6);
    expect(isSimpleRing(merged[0])).toBe(true);
    expect(area(difference([left], [right])[0])).toBeCloseTo(50, 6);
    expect(area(intersection([left], [right])[0])).toBeCloseTo(50, 6);

    // abutting pieces: union keeps the interrupted vertices, the corner union drops them
    const abutting = [rectangle(0, 0, 5, 10), rectangle(5, 0, 5, 10)];
    expect(union(abutting)[0]).toContainEqual([5, 0]);
    expect(unionOnCorners(abutting)[0]).toHaveLength(4);

    expect(area(offset([left], 1)[0])).toBeGreaterThan(area(left));
    expect(area(offset([left], -1)[0])).toBeCloseTo(64, 6);
    const band = bufferLine([[0, 0], [10, 0]], 2)[0];
    expect(coversSegment(band, [0, 0], [10, 0])).toBe(true);
    expect(area(band)).toBeGreaterThan(10 * 2); // the straight run plus its round ends
    expect(snap(1.00049)).toBe(1);
    expect(snapPoint([1.0006, -1.0006])).toEqual([1.001, -1.001]);
  });

  it('nodes crossings and exact vertex contacts into stable simple grid rings', () => {
    // an exact nonadjacent vertex contact is split into simple cycles, area unchanged
    const touching: Polygon = [
      [1449.535, 2122.994], [1448.119, 2176.502], [1448.268, 2176.528],
      [1448.268, 2176.529], [1447.97, 2176.475], [1449.386, 2122.967],
    ];
    const source = toGrid(touching);
    const noded = normalizePaths([source]);
    const twiceArea = (path: GridPath): bigint => path.reduce((sum, p, i) => {
      const q = path[(i + 1) % path.length];
      return sum + BigInt(p.x) * BigInt(q.y) - BigInt(q.x) * BigInt(p.y);
    }, 0n);
    expect(noded.reduce((sum, path) => sum + twiceArea(path), 0n)).toBe(twiceArea(source));
    expect(noded.map(toPolygon).every(isSimpleRing)).toBe(true);
    expect(normalizePaths(noded)).toEqual(noded);

    // a self-crossing boundary becomes the two bodies it encloses, on the 1 mm lattice
    expect(isSimpleRing(sidewalk)).toBe(false);
    const output = union([sidewalk]);
    expect(output).toHaveLength(2);
    expect(output.every((polygon) => isSimpleRing(polygon) && signedArea(polygon) > 0)).toBe(true);
    const [a, b, c, d] = [sidewalk[2], sidewalk[3], sidewalk[13], sidewalk[14]];
    const before = edges([sidewalk]), after = edges(output);
    expect([...before].filter((edge) => !after.has(edge)).sort()).toEqual([edgeKey(a, b), edgeKey(c, d)].sort());
    expect([...after].filter((edge) => !before.has(edge)).sort()).toEqual([edgeKey(a, d), edgeKey(b, c)].sort());
    expect(output.reduce((total, polygon) => total + area(polygon), 0))
      .toBeCloseTo(signedArea(sidewalk) - signedArea([a, b, c, d]), 8);
    const crossing = segmentIntersection(a, b, c, d)!.point;
    for (const wedge of [[crossing, b, c], [crossing, d, a]] as Polygon[]) {
      // every moved point stays inside the half-cell band around its source boundary
      const longestSide = Math.max(...wedge.map((p, i) => dist(p, wedge[(i + 1) % wedge.length])));
      expect(2 * area(wedge) / longestSide).toBeLessThan(GRID_STEP / Math.sqrt(2));
    }
    expect(canonical(union(output))).toEqual(canonical(output));
    expect(canonical(difference([sidewalk], []))).toEqual(canonical(output));
    const normalized = normalizePaths([toGrid(sidewalk)]);
    expect(canonical(normalizePaths([toGrid([...sidewalk].reverse())]).map(toPolygon))).toEqual(canonical(normalized.map(toPolygon)));
  });
});

describe('grid queries', () => {
  it('owns a cell through its lower faces only, and pairs only rectangles that can touch', () => {
    const cases: [Vec2, Vec2, boolean][] = [
      [[-0.001, 0], [0, -0.001], true],
      [[0.001, 0], [0, 0.001], false],
      [[-0.001, 0], [0, 0.001], false],
      [[-0.002, -0.001], [0.002, 0.001], true],
      // within 0.6 mm of the centre and never inside its cell
      [[-0.006, 0], [0.004, 0.001], false],
    ];
    for (const [a, b, expected] of cases) {
      expect(segmentVisitsGridCell(a, b, [0, 0])).toBe(expected);
      expect(segmentVisitsGridCell(b, a, [0, 0])).toBe(expected);
    }
    expect(segmentVisitsGridCell([-0.011, -0.02], [-0.01, -0.021], [-0.01, -0.02])).toBe(true);
    expect(segmentVisitsGridCell([0, 0], [0, 0], [0, 0])).toBe(true);
    expect(segmentVisitsGridCell([0.001, 0], [0.001, 0], [0, 0])).toBe(false);

    // upright rectangles are answered with arithmetic, and a fixed set only compares pairs that can touch
    const bounds = boxOf([[0, 0], [4, 2]]);
    expect(bounds).toEqual({ minX: 0, minZ: 0, maxX: 4, maxZ: 2 });
    expect(grow(bounds, 1)).toEqual({ minX: -1, minZ: -1, maxX: 5, maxZ: 3 });
    expect(overlaps(bounds, boxOf([[4, 2], [6, 6]]))).toBe(true);
    expect(overlaps(bounds, boxOf([[4.001, 2], [6, 6]]))).toBe(false);
    const boxes = [[[0, 0], [10, 10]], [[9, 9], [12, 12]], [[100, 100], [101, 101]], [[5, 5], [6, 6]]]
      .map((points) => boxOf(points as Vec2[]));
    const pairs = new BoxPairs(boxes);
    expect(pairs.after(0)).toEqual([1, 3]);
    expect(pairs.after(1)).toEqual([]);
    expect(pairs.after(2)).toEqual([]);
  });
});

describe('precision diagnostics', () => {
  it('separates reported precision wedges from real interior, across seams and either winding', () => {
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
    expect(hasInteriorBeyondPrecision([rectangle(0, 0, 5, 0.001)])).toBe(false);
    expect(hasInteriorBeyondPrecision([rectangle(0, 0, 5, 0.00101)])).toBe(true);

    // the union across a partition seam has interior that neither piece has alone
    const pieces = [rectangle(0, 0, 5, 0.00075), rectangle(0, 0.00075, 5, 0.00075)];
    expect(pieces.map((piece) => hasInteriorBeyondPrecision([piece]))).toEqual([false, false]);
    expect(hasInteriorBeyondPrecision(pieces)).toBe(true);
    expect(hasInteriorBeyondPrecision(pieces, 0.002)).toBe(false);
    expect(precisionInterior(pieces, 0.002)).toEqual([]);

    // a tapering obstruction keeps only its thick end, unsnapped
    const wedge: Polygon = [[0, 0], [100, 0], [0, 0.0011]];
    const core = precisionInterior([wedge]).flat();
    expect(Math.min(...core.map(([x]) => x))).toBeCloseTo(0.0005, 8);
    expect(Math.max(...core.map(([x]) => x))).toBeGreaterThan(8);
    expect(core.some(([x, y]) => Math.round(x * 1000) !== x * 1000 || Math.round(y * 1000) !== y * 1000)).toBe(true);

    // nonzero fill keeps holes, in either winding
    const outer = rectangle(0, 0, 10, 10), hole = rectangle(3, 3, 4, 4).reverse();
    for (const region of [[outer, hole], [[...outer].reverse(), [...hole].reverse()]]) {
      const contours = precisionInterior(region);
      expect(contours.some((ring) => signedArea(ring) > 0)).toBe(true);
      expect(contours.some((ring) => signedArea(ring) < 0)).toBe(true);
      expect(contours.reduce((sum, ring) => sum + signedArea(ring), 0)).toBeCloseTo(9.999 ** 2 - 4.001 ** 2, 8);
    }
    expect(precisionInterior([outer, [...outer].reverse()])).toEqual([]);
  });

  it('covers a subject within one grid step of its source, and no further', () => {
    const masks = coordinateCover([box(0, 0, 10, 10)]);
    const allowance = GRID_STEP / Math.SQRT2;
    expect(covered(box(2, 2, 8, 10 + allowance), masks)).toBe(true);
    expect(covered(box(2, 2, 8, 10.000768), masks)).toBe(false);
    expect(covered(box(2, 2, 8, 10.000768), coordinateCover([box(0, 0, 10, 10)], 0.002))).toBe(true);
    // a deep thin spike is missing land even though it has no precision interior
    const spike: Polygon = [[4, 9], [6, 9], [6, 10], [5.0001, 10], [5.0001, 12], [5, 12], [5, 10], [4, 10]];
    expect(covered(spike, masks)).toBe(false);

    // bevels join adjacent offsets without bridging a concave notch or a gap between pieces
    const concave: Polygon = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]];
    const joined = coordinateCover([concave, box(5, 0, 8, 3)]);
    expect(covered(box(-0.0002, -0.0002, 0.5, 0.5), joined)).toBe(true);
    expect(covered(box(1, 1, 1.0006, 1.0006), joined)).toBe(true);
    expect(covered(box(1, 1, 1.001, 1.001), joined)).toBe(false);
    expect(covered(box(2, 0.2, 6, 0.8), joined)).toBe(false);
    expect(coordinateCover([])).toEqual([]);

    // source coordinates, winding and array ownership stay with the caller
    const source = box(0.000123, 0.000234, 4.000123, 3.000234);
    const untouched = structuredClone(source);
    const forwards = coordinateCover([source]);
    expect(forwards[0]).toEqual(untouched);
    expect(coordinateCover([[...source].reverse()])[0]).toEqual(untouched);
    forwards[0][0][0] = 99;
    expect(source).toEqual(untouched);
  });

  it('encloses every published edge position of an authored sweep in exact copies', () => {
    const input: NumericSweepInput = {
      sides: [{ from: [0, 0], to: [0.003, 0.007] }, { from: [0.001, 0], to: [0.004, 0.007] }],
      encoding: 'authored-1mm',
    };
    const source: Polygon = [input.sides[0].from, input.sides[0].to, input.sides[1].to, input.sides[1].from];
    const view = edgePositionView({ position: { ...input.sides[0], t: 0.7 }, encoding: input.encoding });
    expect(coversSegment(source, view, view)).toBe(false);
    const envelope = numericSweepEnvelope(input);
    expect(coversSegment(envelope.polygon, view, view)).toBe(true);
    expect(SourcePartition.create({ id: 'envelope', source: envelope.polygon }).covers('envelope', source)).toBe(true);

    // constant coordinates stay exact and every returned array belongs to the caller
    const flat: NumericSweepInput = {
      sides: [{ from: [0, 0.001], to: [16, 0.001] }, { from: [0, 0.002], to: [16, 0.002] }],
      encoding: 'authored-1mm',
    };
    const original = structuredClone(flat), band = numericSweepEnvelope(flat);
    expect(Math.min(...band.polygon.map((point) => point[1]))).toBe(0.001);
    expect(Math.max(...band.polygon.map((point) => point[1]))).toBe(0.002);
    for (const [index, side] of band.sides.entries()) {
      expect([side.from.lower[1], side.from.upper[1]]).toEqual([flat.sides[index].from[1], flat.sides[index].from[1]]);
      expect([side.to.lower[1], side.to.upper[1]]).toEqual([flat.sides[index].to[1], flat.sides[index].to[1]]);
    }
    band.polygon[0][0] = 99;
    expect(flat).toEqual(original);
    expect(numericSweepEnvelope(flat)).toEqual(numericSweepEnvelope(flat));
  });
});

describe('segment coverage', () => {
  it('requires every point of a segment or path, with no distance allowance', () => {
    const a: Vec2 = [1, 6], b: Vec2 = [7, 6];
    expect(coversSegment(courtyard, a, a)).toBe(true);
    expect(coversSegment(courtyard, a, b)).toBe(false);
    expect(coversSegment(courtyard, [2, 8], [6, 8])).toBe(false);
    for (const [from, to] of [[[0, 0], [8, 0]], [[1, 3], [7, 3]], [[1, 5], [5, 1]], [[3, 3], [1, 5]]] as [Vec2, Vec2][]) {
      expect(coversSegment(courtyard, from, to)).toBe(true);
      expect(coversSegment([...courtyard].reverse(), to, from)).toBe(true);
    }
    // represented coordinates decide, without snapping
    const e = Number.EPSILON;
    const triangle: Polygon = [[0, 0], [2, 2 + 2 * e], [0, 4]];
    expect(coversSegment(triangle, [1, 1 + e], [1, 1 + e])).toBe(true);
    expect(coversSegment(triangle, [1 + e, 1 + 2 * e], [1 + e, 1 + 2 * e])).toBe(false);

    expect(coversPath(courtyard, [[1, 6], [1, 1], [7, 1], [7, 6]])).toBe(true);
    expect(coversPath(courtyard, [[1, 1], [1, 6], [7, 6]])).toBe(false);
    expect(coversPath(courtyard, [])).toBe(false);
    expect(coversPath(courtyard, [[3, 3]])).toBe(true);
  });
});

describe('errors', () => {
  it('rejects invalid diagnostic widths, malformed rings and degenerate sweeps with E_INVARIANT', () => {
    const invariant = expect.objectContaining({ code: 'E_INVARIANT' });
    for (const width of [0, NaN]) {
      expect(() => hasInteriorBeyondPrecision([], width)).toThrowError(invariant);
      expect(() => precisionInterior([], width)).toThrowError(invariant);
      expect(() => coordinateCover([], width)).toThrowError(invariant);
    }
    expect(() => coordinateCover([[[0, 0], [1, NaN], [0, 1]]])).toThrowError(invariant);
    expect(() => coordinateCover([[[0, 0], [1, 0], [0, 0]]])).toThrowError(invariant);
    expect(() => numericSweepEnvelope({
      sides: [{ from: [0.0001, 0], to: [1, 0] }, { from: [0, 1], to: [1, 1] }], encoding: 'authored-1mm',
    })).toThrowError(invariant);
    expect(() => numericSweepEnvelope({
      sides: [{ from: [0, 0], to: [1, 0] }, { from: [2, 0], to: [3, 0] }], encoding: 'authored-1mm',
    })).toThrowError(invariant);
  });
});
