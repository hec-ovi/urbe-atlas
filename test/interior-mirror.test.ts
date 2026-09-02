/**
 * The core hosting constants mirror interior's published core feasibility:
 * this fails when that file's numbers move, so the mirror and the rectangles
 * CONTRACT.md states get updated on purpose. The file check is skipped where
 * the interior box is not checked out alongside this one.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPACT_RECT, INTERIOR, STANDARD_RECT, WALKUP_RECT, WALKUP_TWO_STAIRS_RECT } from '../src/zoning/core';

const FEASIBILITY = new URL('../../interior/schemas/core-feasibility.json', import.meta.url);

describe('interior core feasibility mirror', () => {
  it.skipIf(!existsSync(FEASIBILITY))('matches the published constants', () => {
    const { constants } = JSON.parse(readFileSync(FEASIBILITY, 'utf8'));
    const { facadeDepth, ...plain } = INTERIOR;
    for (const [key, value] of Object.entries(plain)) expect(constants[key], key).toBe(value);
    expect(Math.max(...(Object.values(constants.facadeDepth) as number[])), 'facadeDepth').toBe(facadeDepth);
  });

  it('derives the hosting rectangles CONTRACT.md states', () => {
    expect(WALKUP_RECT).toEqual([11.14, 9.74]);
    expect(WALKUP_TWO_STAIRS_RECT).toEqual([17.64, 9.74]);
    expect(COMPACT_RECT).toEqual([12.14, 13.74]);
    expect(STANDARD_RECT).toEqual([20.14, 9.74]);
  });
});
