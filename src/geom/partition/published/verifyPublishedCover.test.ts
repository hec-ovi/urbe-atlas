import { describe, expect, it } from 'vitest';
import { verifyPublishedCover } from './verifyPublishedCover';
import type { PublishedCoverInput } from './schema';
import type { Polygon } from '../schema';

const rectangle = (x0: number, y0: number, x1: number, y1: number): Polygon => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const piece = (id: string, polygon: Polygon) => ({ id, polygon });
const fail = (input: PublishedCoverInput) => expect(() => verifyPublishedCover(input)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));

describe('published ground cover contract', () => {
  it('verifies the independent boundary minus overlapping exclusions without mutating input', () => {
    const input: PublishedCoverInput = { boundary: rectangle(0, 0, 10, 10),
      exclusions: [rectangle(2, 2, 5, 8), rectangle(4, 2, 8, 8), rectangle(20, 20, 21, 21)],
      pieces: [piece('bottom', rectangle(0, 0, 10, 2)), piece('top', rectangle(0, 8, 10, 10).reverse()),
        piece('left', rectangle(0, 2, 2, 8)), piece('right', rectangle(8, 2, 10, 8))] };
    const original = structuredClone(input);
    verifyPublishedCover(JSON.parse(JSON.stringify(input)));
    expect(input).toEqual(original);
  });

  it('permits a shared rational subdivision on a fixed oblique edge', () => {
    const input: PublishedCoverInput = { boundary: rectangle(0, 0, 3, 3), exclusions: [], pieces: [
      piece('fixed', [[0, 0], [3, 0], [3, 1]]),
      piece('left', [[0, 0], [1, 1 / 3], [1, 3], [0, 3]]),
      piece('right', [[1, 1 / 3], [3, 1], [3, 3], [1, 3]]),
    ] };
    verifyPublishedCover(input);
    const changed = structuredClone(input);
    changed.pieces[1].polygon[1][1] += 1e-10;
    fail(changed);
  });

  it('preserves a fully paired interior corner while resolving a domain subdivision', () => {
    const near = 2 - Number.EPSILON, bottom: [number, number] = [2, 2 / 3], top: [number, number] = [2, 3];
    const input: PublishedCoverInput = { boundary: [[0, 0], [3, 1], [3, 3], [0, 3]], exclusions: [], pieces: [
      piece('left', [[0, 0], [1, 1 / 3], bottom, [near, 2], top, [0, 3]]),
      piece('thin', [bottom, top, [near, 2]]),
      piece('right', [bottom, [3, 1], [3, 3], top]),
    ] };
    verifyPublishedCover(input);
    const changed = structuredClone(input);
    changed.pieces[0].polygon[3][0] -= 1e-9;
    fail(changed);
  });

  it('retains both independent boundary constraints at a derived exclusion-union corner', () => {
    const input: PublishedCoverInput = { boundary: rectangle(0, 0, 4, 4),
      exclusions: [[[0, 0], [3, 1], [0, 3]], rectangle(0, 0, 1, 4)],
      pieces: [piece('land', [[1, 0], [4, 0], [4, 4], [1, 4], [1, 7 / 3], [3, 1], [1, 1 / 3]])] };
    verifyPublishedCover(input);
    const changed = structuredClone(input);
    changed.pieces[0].polygon[4][0] += .0001;
    fail(changed);
  });

  it('rejects missing outer or inner land, duplicate owners and unilateral seam movement', () => {
    const input: PublishedCoverInput = { boundary: rectangle(0, 0, 9, 3), exclusions: [],
      pieces: [piece('left', rectangle(0, 0, 3, 3)), piece('middle', rectangle(3, 0, 6, 3)), piece('right', rectangle(6, 0, 9, 3))] };
    verifyPublishedCover(input);
    for (const corrupt of [
      (value: PublishedCoverInput) => { value.pieces.shift(); },
      (value: PublishedCoverInput) => { value.pieces.splice(1, 1); },
      (value: PublishedCoverInput) => { value.pieces.push(value.pieces[0]); },
      (value: PublishedCoverInput) => { value.pieces.push({ ...value.pieces[0], id: 'duplicate-geometry' }); },
      (value: PublishedCoverInput) => { value.pieces[0].polygon[1][0] += 1e-9; },
      (value: PublishedCoverInput) => { value.pieces[0].polygon[0][0] -= 1; },
    ]) { const changed = structuredClone(input); corrupt(changed); fail(changed); }
  });

  it('rejects equal-area overlap and omission instead of relying on area sums', () => {
    fail({ boundary: rectangle(0, 0, 10, 10), exclusions: [],
      pieces: [piece('left', rectangle(0, 0, 6, 10)), piece('right', rectangle(5, 0, 9, 10))] });
  });

  it('retains representable thin land without applying a distance or area threshold', () => {
    const low = 1, middle = 1 + Number.EPSILON, high = 1 + 2 * Number.EPSILON;
    verifyPublishedCover({ boundary: rectangle(0, low, 1, high), exclusions: [],
      pieces: [piece('below', rectangle(0, low, 1, middle)), piece('above', rectangle(0, middle, 1, high))] });
    fail({ boundary: rectangle(0, 0, 1, 2), exclusions: [],
      pieces: [piece('below', rectangle(0, 0, 1, low)), piece('above', rectangle(0, high, 1, 2))] });
  });

  it('accepts an empty cover only when exclusions remove the whole independent domain', () => {
    verifyPublishedCover({ boundary: rectangle(0, 0, 1, 1), exclusions: [rectangle(-1, -1, 2, 2)], pieces: [] });
    fail({ boundary: rectangle(0, 0, 1, 1), exclusions: [], pieces: [] });
    fail({ boundary: rectangle(0, 0, 1, 1), exclusions: [rectangle(-1, -1, 2, 2)], pieces: [piece('extra', rectangle(0, 0, 1, 1))] });
  });

  it('rejects malformed geometry through the public entry point', () => {
    const input: PublishedCoverInput = { boundary: rectangle(0, 0, 1, 1), exclusions: [], pieces: [piece('one', rectangle(0, 0, 1, 1))] };
    for (const polygon of [[], [[0, 0], [3, 2], [0, 2], [2, 0]], [[0, 0], [Infinity, 0], [0, 1]], [[0, 0, 1], [1, 0, 1], [0, 1, 1]]]) {
      fail({ ...input, pieces: [piece('one', polygon as Polygon)] });
    }
    fail({ ...input, pieces: [piece('', rectangle(0, 0, 1, 1))] });
  });

  it('rejects collapsed piece edges while retaining domain ring normalization', () => {
    const ring = rectangle(0, 0, 1, 1), exclusion = rectangle(2, 2, 3, 3);
    const input: PublishedCoverInput = { boundary: [...ring, ring[0]],
      exclusions: [[exclusion[0], ...exclusion, exclusion[0]]], pieces: [piece('one', ring)] };
    verifyPublishedCover(input);
    for (const polygon of [
      [ring[0], ring[1], ring[1], ring[2], ring[3]],
      [...ring, ring[0]],
    ]) fail({ ...input, pieces: [piece('one', polygon)] });
  });
});
