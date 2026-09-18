/** Published cover contract: what an independent boundary accepts, and the E_INVARIANT set. */
import { describe, expect, it } from 'vitest';
import { verifyPublishedCover } from './verifyPublishedCover';
import type { PublishedCoverInput } from './schema';
import type { Polygon } from '../schema';

const rectangle = (x0: number, y0: number, x1: number, y1: number): Polygon => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const piece = (id: string, polygon: Polygon) => ({ id, polygon });
const fail = (input: PublishedCoverInput) =>
  expect(() => verifyPublishedCover(input)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));

describe('published ground cover', () => {
  it('accepts pieces that cover the boundary minus its exclusions exactly once, input unchanged', () => {
    const framed: PublishedCoverInput = { boundary: rectangle(0, 0, 10, 10),
      exclusions: [rectangle(2, 2, 5, 8), rectangle(4, 2, 8, 8), rectangle(20, 20, 21, 21)],
      pieces: [piece('bottom', rectangle(0, 0, 10, 2)), piece('top', rectangle(0, 8, 10, 10).reverse()),
        piece('left', rectangle(0, 2, 2, 8)), piece('right', rectangle(8, 2, 10, 8))] };
    const original = structuredClone(framed);
    verifyPublishedCover(framed);
    expect(framed).toEqual(original);

    // a shared rational subdivision on a fixed oblique edge, and a derived exclusion-union corner
    verifyPublishedCover({ boundary: rectangle(0, 0, 3, 3), exclusions: [], pieces: [
      piece('fixed', [[0, 0], [3, 0], [3, 1]]),
      piece('left', [[0, 0], [1, 1 / 3], [1, 3], [0, 3]]),
      piece('right', [[1, 1 / 3], [3, 1], [3, 3], [1, 3]]),
    ] });
    verifyPublishedCover({ boundary: rectangle(0, 0, 4, 4),
      exclusions: [[[0, 0], [3, 1], [0, 3]], rectangle(0, 0, 1, 4)],
      pieces: [piece('land', [[1, 0], [4, 0], [4, 4], [1, 4], [1, 7 / 3], [3, 1], [1, 1 / 3]])] });

    // representable thin land is land; an empty cover needs an empty domain
    const low = 1, middle = 1 + Number.EPSILON, high = 1 + 2 * Number.EPSILON;
    verifyPublishedCover({ boundary: rectangle(0, low, 1, high), exclusions: [],
      pieces: [piece('below', rectangle(0, low, 1, middle)), piece('above', rectangle(0, middle, 1, high))] });
    verifyPublishedCover({ boundary: rectangle(0, 0, 1, 1), exclusions: [rectangle(-1, -1, 2, 2)], pieces: [] });

    // repeated closing points in the domain rings normalize
    const ring = rectangle(0, 0, 1, 1), exclusion = rectangle(2, 2, 3, 3);
    verifyPublishedCover({ boundary: [...ring, ring[0]],
      exclusions: [[exclusion[0], ...exclusion, exclusion[0]]], pieces: [piece('one', ring)] });
  });

  it('rejects missing, duplicated, overlapping and unilaterally moved land', () => {
    const strips: PublishedCoverInput = { boundary: rectangle(0, 0, 9, 3), exclusions: [],
      pieces: [piece('left', rectangle(0, 0, 3, 3)), piece('middle', rectangle(3, 0, 6, 3)), piece('right', rectangle(6, 0, 9, 3))] };
    verifyPublishedCover(strips);
    for (const corrupt of [
      (value: PublishedCoverInput) => { value.pieces.shift(); },
      (value: PublishedCoverInput) => { value.pieces.splice(1, 1); },
      (value: PublishedCoverInput) => { value.pieces.push(value.pieces[0]); },
      (value: PublishedCoverInput) => { value.pieces.push({ ...value.pieces[0], id: 'duplicate-geometry' }); },
      (value: PublishedCoverInput) => { value.pieces[0].polygon[1][0] += 1e-9; },
      (value: PublishedCoverInput) => { value.pieces[0].polygon[0][0] -= 1; },
    ]) { const changed = structuredClone(strips); corrupt(changed); fail(changed); }

    // equal areas do not excuse an overlap, and a witness beyond the conversion range fails
    fail({ boundary: rectangle(0, 0, 10, 10), exclusions: [],
      pieces: [piece('left', rectangle(0, 0, 6, 10)), piece('right', rectangle(5, 0, 9, 10))] });
    fail({ boundary: rectangle(0, 0, 3, 3), exclusions: [], pieces: [
      piece('fixed', [[0, 0], [3, 0], [3, 1]]),
      piece('left', [[0, 0], [1, 1 / 3 + 1e-10], [1, 3], [0, 3]]),
      piece('right', [[1, 1 / 3], [3, 1], [3, 3], [1, 3]]),
    ] });
    fail({ boundary: rectangle(0, 0, 1, 2), exclusions: [],
      pieces: [piece('below', rectangle(0, 0, 1, 1)), piece('above', rectangle(0, 1 + 2 * Number.EPSILON, 1, 2))] });
    fail({ boundary: rectangle(0, 0, 1, 1), exclusions: [], pieces: [] });
    fail({ boundary: rectangle(0, 0, 1, 1), exclusions: [rectangle(-1, -1, 2, 2)], pieces: [piece('extra', rectangle(0, 0, 1, 1))] });
  });

  it('rejects malformed rings, empty ids and collapsed piece edges', () => {
    const one: PublishedCoverInput = { boundary: rectangle(0, 0, 1, 1), exclusions: [], pieces: [piece('one', rectangle(0, 0, 1, 1))] };
    const ring = rectangle(0, 0, 1, 1);
    for (const polygon of [[], [[0, 0], [3, 2], [0, 2], [2, 0]], [[0, 0], [Infinity, 0], [0, 1]], [[0, 0, 1], [1, 0, 1], [0, 1, 1]],
      [ring[0], ring[1], ring[1], ring[2], ring[3]], [...ring, ring[0]]]) {
      fail({ ...one, pieces: [piece('one', polygon as Polygon)] });
    }
    fail({ ...one, pieces: [piece('', rectangle(0, 0, 1, 1))] });
  });
});
