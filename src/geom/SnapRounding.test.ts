import { describe, expect, it } from 'vitest';
import { difference, GRID_STEP, union } from './clip';
import { area, isSimpleRing, signedArea } from './polygon';
import { normalizePaths } from './SnapRounding';
import type { GridPath, Polygon } from './schema';
import { dist, segmentIntersection } from './vec';

// Two nearly parallel snapped boundaries cross in the middle of a 62 m side.
const sidewalk: Polygon = [
  [243.603, 248.782], [244.109, 249.012], [244.537, 249.368], [286.498, 295.025],
  [286.849, 295.553], [287.017, 296.148], [286.993, 296.771], [286.780, 297.354],
  [286.393, 297.849], [272.702, 310.651], [238.477, 341.428], [238.477, 335.579],
  [269.770, 307.439], [284.902, 293.289], [246.030, 250.992], [238.477, 258.409],
  [238.477, 252.310], [241.550, 249.293], [241.999, 248.958], [242.515, 248.754],
  [243.060, 248.695],
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

const edgeKey = (a: Polygon[number], b: Polygon[number]): string => [JSON.stringify(a), JSON.stringify(b)].sort().join(':');
const edges = (polygons: Polygon[]): Set<string> => new Set(polygons.flatMap((polygon) => polygon.map((a, i) => edgeKey(a, polygon[(i + 1) % polygon.length]))));

describe('grid-cell crossing normalization', () => {
  it('nodes an exact nonadjacent vertex contact into simple cycles without changing area', () => {
    const touching: Polygon = [
      [1449.535, 2122.994], [1448.119, 2176.502], [1448.268, 2176.528],
      [1448.268, 2176.529], [1447.97, 2176.475], [1449.386, 2122.967],
    ];
    const source = toGrid(touching);
    const output = normalizePaths([source]);
    const expected = [
      [touching[1], touching[2], touching[3]],
      [touching[0], touching[1], touching[4], touching[5]],
    ];
    expect(canonical(output.map(toPolygon))).toEqual(canonical(expected));
    expect(output.map(toPolygon).every(isSimpleRing)).toBe(true);
    const twiceArea = (path: GridPath): bigint => path.reduce((sum, p, i) => {
      const q = path[(i + 1) % path.length];
      return sum + BigInt(p.x) * BigInt(q.y) - BigInt(q.x) * BigInt(p.y);
    }, 0n);
    expect(output.reduce((sum, path) => sum + twiceArea(path), 0n)).toBe(twiceArea(source));
    expect(output.flat().every((point) => source.some((vertex) => point.x === vertex.x && point.y === vertex.y))).toBe(true);
    expect(normalizePaths(output)).toEqual(output);
    expect(canonical(union([touching]))).toEqual(canonical(expected));
  });

  it('publishes stable simple grid rings while preserving the two sidewalk bodies', () => {
    expect(isSimpleRing(sidewalk)).toBe(false);
    const output = union([sidewalk]);
    expect(output).toHaveLength(2);
    expect(output.every((polygon) => isSimpleRing(polygon) && signedArea(polygon) > 0)).toBe(true);
    expect(output.flat().every((point) => point.every((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7))).toBe(true);
    const retainedArea = output.reduce((total, polygon) => total + area(polygon), 0);
    const [a, b, c, d] = [sidewalk[2], sidewalk[3], sidewalk[13], sidewalk[14]];
    const before = edges([sidewalk]), after = edges(output);
    expect([...before].filter((edge) => !after.has(edge)).sort()).toEqual([edgeKey(a, b), edgeKey(c, d)].sort());
    expect([...after].filter((edge) => !before.has(edge)).sort()).toEqual([edgeKey(a, d), edgeKey(b, c)].sort());
    // Only these four boundaries change. Their crossing quadrilateral gives an
    // independent signed-area proof and two exact symmetric-difference wedges.
    expect(retainedArea).toBeCloseTo(signedArea(sidewalk) - signedArea([a, b, c, d]), 8);
    const crossing = segmentIntersection(a, b, c, d)!.point;
    const wedges: Polygon[] = [[crossing, b, c], [crossing, d, a]];
    expect(wedges.reduce((sum, wedge) => sum + area(wedge), 0)).toBeCloseTo(0.0114271105, 8);
    for (const wedge of wedges) {
      // Every changed point is inside the half-cell source-boundary band.
      const longestSide = Math.max(...wedge.map((p, i) => dist(p, wedge[(i + 1) % wedge.length])));
      expect(2 * area(wedge) / longestSide).toBeLessThan(GRID_STEP / Math.sqrt(2));
    }
    expect(canonical(union(output))).toEqual(canonical(output));
    expect(canonical(difference([sidewalk], []))).toEqual(canonical(output));
    expect(canonical(union([sidewalk.slice(7).concat(sidewalk.slice(0, 7))]))).toEqual(canonical(output));
    const normalized = normalizePaths([toGrid(sidewalk)]);
    expect(normalizePaths(normalized)).toEqual(normalized);
    expect(canonical(normalizePaths([toGrid([...sidewalk].reverse())]).map(toPolygon))).toEqual(canonical(normalized.map(toPolygon)));
  });

  it('routes shared reversed edges through the same half-cell corner once', () => {
    const path: GridPath = [{ x: 25, y: 14 }, { x: 28, y: 5 }, { x: 24, y: 11 }, { x: 26, y: 13 }, { x: 28, y: 15 }];
    const expected: GridPath[] = [
      [{ x: 26, y: 13 }, { x: 28, y: 5 }, { x: 24, y: 11 }],
      [{ x: 25, y: 14 }, { x: 26, y: 13 }, { x: 28, y: 15 }],
    ];
    const output = normalizePaths([path, [...path].reverse()]);
    expect(canonical(output.map(toPolygon))).toEqual(canonical([...expected, ...expected].map(toPolygon)));
    expect(normalizePaths(output)).toEqual(output);
    const translate = (path: GridPath): GridPath => path.map((p) => ({ x: p.x - 100, y: p.y - 100 }));
    expect(canonical(normalizePaths([translate(path)]).map(toPolygon))).toEqual(canonical(expected.map(translate).map(toPolygon)));
  });
});
