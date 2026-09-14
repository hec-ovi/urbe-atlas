import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { ParcelType } from '../../schema/blueprint';
import { Rng } from '../core/rng';
import { makeEnvelope } from './envelopes';
import { activeMinFloorHeight, FLOOR_GENERATION_POLICY, minFloorHeight } from './floorMinimums';

const published = new URL('../../../exterior/schemas/floor-constants.json', import.meta.url);

it.skipIf(!existsSync(published))('mirrors the published hard family bounds and active generation policy', () => {
  const source = JSON.parse(readFileSync(published, 'utf8'));
  for (const [key, value] of Object.entries(FLOOR_GENERATION_POLICY)) expect(source.generationPolicy[key]).toBe(value);
  expect(FLOOR_GENERATION_POLICY.defaultFloorHeight).toBe(FLOOR_GENERATION_POLICY.defaultClearHeight + FLOOR_GENERATION_POLICY.clearHeightAllowance);
  for (const [type, family] of Object.entries(source.families)) {
    const hard = source.constants[family as string].minFloorHeight;
    expect(minFloorHeight(type as ParcelType)).toBe(hard);
    expect(activeMinFloorHeight(type as ParcelType)).toBe(Math.max(hard, source.generationPolicy.defaultFloorHeight));
  }
});

it('allocates clear-height floors while retaining taller programs and authored floor counts', () => {
  const programs: [ParcelType, number][] = [
    ['residential', 4.5], ['hotel', 4.5], ['offices', 4.5], ['hospital', 4.5], ['clinic', 4.5],
    ['police', 4.5], ['military', 4.5], ['commerce', 4.5], ['restaurant', 4.5], ['coffee_shop', 4.5],
    ['corpo', 4.6], ['mall', 5.5], ['factory', 10],
  ];
  for (const [type, pitch] of programs) {
    const envelope = makeEnvelope(type, 'mid', 12, Rng.from('floor-policy', type));
    expect(envelope.floorHeight).toBe(pitch);
    expect(envelope.maxFloors).toBeGreaterThanOrEqual(envelope.minFloors);
    expect(envelope.maxFloors).toBeLessThanOrEqual(12);
    expect(envelope.maxHeight).toBe(Math.round(envelope.maxFloors * pitch * 100) / 100);
    expect(envelope.maxHeight / 4.5).toBeGreaterThanOrEqual(envelope.maxFloors);
  }
});
