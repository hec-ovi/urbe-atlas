/** Zoning contract surface: hosting entries, mirrored floor constants and the population forecast. */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BuildingGrid, ParcelType, Polygon, Vec2 } from '../../schema/blueprint';
import { Rng } from '../core/rng';
import { area, bounds } from '../geom/polygon';
import { COMPACT_RECT, INTERIOR, STANDARD_RECT, WALKUP_RECT, WALKUP_TWO_STAIRS_RECT } from './core';
import { makeEnvelope } from './envelopes';
import { activeMinFloorHeight, FLOOR_GENERATION_POLICY, minFloorHeight } from './floorMinimums';
import { FootprintHost, type HostingProfile } from './FootprintHost';
import { hostingProfile } from './profiles';
import { RectangularFootprint } from './RectangularFootprint';
import { rectangleCoverageGap } from './rectangleCoverage';
import { Zoning } from './Zoning';
import type { DistrictCapacityInput } from './population-schema';

const profile: HostingProfile = { setback: 0, band: 9.74, heavy: false, keep: 0 };
const grid: BuildingGrid = { origin: [0, 0], angle: 0, spacing: 0.5 };
const FEASIBILITY = new URL('../../../interior/schemas/core-feasibility.json', import.meta.url);
const FLOOR_CONSTANTS = new URL('../../../exterior/schemas/floor-constants.json', import.meta.url);

describe('footprint hosting', () => {
  it('fits whole grid cells inside the setback, applies the band and refuses a lot that hosts no core', () => {
    const inset: Polygon = [[0, 0], [20, 0], [20, 20], [0, 20]];
    expect(RectangularFootprint.fit(inset, profile, grid)).toEqual(inset);
    expect(RectangularFootprint.fit(inset, { ...profile, band: 20.5 }, grid)).toBeNull();
    expect(RectangularFootprint.fit([[0, 0], [12, 0], [12, 24], [0, 24]], { ...profile, heavy: true }, grid)).toBeNull();

    const host = new FootprintHost({ shape: 'rectangle', grid });
    expect(host.fit(inset, profile)).toEqual({ footprint: inset, floorCap: Infinity });
    expect(host.fit(inset, { ...profile, setback: 1, keep: 1 })?.footprint)
      .toEqual([[1, 1], [19, 1], [19, 19], [1, 19]]);
    // a corpo lot needs the compact core plus its setback before any rectangle stands
    expect(host.fit([[0, 0], [15, 0], [15, 16], [0, 16]], hostingProfile('corpo'))).toBeNull();
    expect(host.fit([[0, 0], [15.5, 0], [15.5, 16], [0, 16]], hostingProfile('corpo'))).toEqual({
      footprint: [[1, 1], [14.5, 1], [14.5, 15], [1, 15]], floorCap: Infinity,
    });
  });

  it('matches exhaustive best-fit selection through concave bays on a rotated construction grid', () => {
    const construction: BuildingGrid = { origin: [1056.234, 2034.876], angle: 0.271828, spacing: 2 };
    const outlines: Polygon[] = [
      [[0, 0], [26, 0], [26, 10], [16, 10], [16, 24], [0, 24]],
      [[0, 0], [24, 0], [24, 24], [16, 24], [16, 12], [12, 12], [12, 24], [0, 24]],
      [[0, 0], [26, 0], [23.999, 24], [0, 24]],
    ];
    for (const outline of outlines) {
      const inset = outline.map((point) => world(point, construction));
      expect(RectangularFootprint.fit(inset, profile, construction)).toEqual(exhaustive(outline, profile, construction));
    }
  });
});

describe('mirrored building constants', () => {
  it('mirrors interior core feasibility and the published floor constants', () => {
    expect([WALKUP_RECT, WALKUP_TWO_STAIRS_RECT, COMPACT_RECT, STANDARD_RECT])
      .toEqual([[11.14, 9.74], [17.64, 9.74], [13.14, 13.74], [20.14, 9.74]]);
    if (!existsSync(FEASIBILITY)) return;
    const { constants } = JSON.parse(readFileSync(FEASIBILITY, 'utf8'));
    const { facadeDepth, ...plain } = INTERIOR;
    for (const [key, value] of Object.entries(plain)) expect(constants[key], key).toBe(value);
    expect(Math.max(...(Object.values(constants.facadeDepth) as number[])), 'facadeDepth').toBe(facadeDepth);

    if (!existsSync(FLOOR_CONSTANTS)) return;
    const source = JSON.parse(readFileSync(FLOOR_CONSTANTS, 'utf8'));
    for (const [key, value] of Object.entries(FLOOR_GENERATION_POLICY)) expect(source.generationPolicy[key]).toBe(value);
    expect(FLOOR_GENERATION_POLICY.defaultFloorHeight)
      .toBe(FLOOR_GENERATION_POLICY.defaultClearHeight + FLOOR_GENERATION_POLICY.clearHeightAllowance);
    for (const [type, family] of Object.entries(source.families)) {
      const hard = source.constants[family as string].minFloorHeight;
      expect(minFloorHeight(type as ParcelType)).toBe(hard);
      expect(activeMinFloorHeight(type as ParcelType)).toBe(Math.max(hard, source.generationPolicy.defaultFloorHeight));
    }
  });

  it('allocates clear-height floors while retaining taller programs', () => {
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
    }
  });
});

describe('population forecast', () => {
  it('reports district residential capacity from net land, use, tier and floor caps', () => {
    const districts: DistrictCapacityInput[] = [
      { districtId: 'd0', kind: 'residential', tier: 'poor', maxFloors: 1, landArea: 10_000 },
      { districtId: 'd1', kind: 'industrial', tier: 'poor', maxFloors: 40, landArea: 10_000 },
      { districtId: 'd2', kind: 'mixed', tier: 'high_rich', maxFloors: 40, landArea: 20_000 },
      { districtId: 'd3', kind: 'mixed', tier: 'poor', maxFloors: 4, landArea: 20_000 },
    ];
    const forecast = Zoning.populationForecast(districts);
    expect(forecast.districts[0]).toEqual({ districtId: 'd0', residentialArea: 8600, meanResidentialFloors: 1, populationEstimate: 108 });
    expect(forecast.districts[1].populationEstimate).toBe(0);
    expect(forecast.districts[2].residentialArea).toBe(10_400);
    expect(forecast.districts[2].populationEstimate).toBeGreaterThan(forecast.districts[3].populationEstimate);
    expect(forecast.populationEstimate).toBe(forecast.districts.reduce((sum, district) => sum + district.populationEstimate, 0));
    expect(Zoning.populationForecast(districts)).toEqual(forecast);
    expect(Zoning.populationForecast([])).toEqual({ populationEstimate: 0, districts: [] });
  });

  it('rejects malformed district capacity input with E_INVALID_PARAMS', () => {
    const district = { districtId: 'd0', kind: 'mixed', tier: 'mid', maxFloors: 4, landArea: 1000 };
    for (const input of [null, [null], [{ ...district, landArea: -1 }], [{ ...district, landArea: Infinity }],
      [{ ...district, kind: 'unknown' }], [{ ...district, tier: 'unknown' }], [{ ...district, maxFloors: 0 }], [district, district]]) {
      expect(() => Zoning.populationForecast(input as unknown as DistrictCapacityInput[]))
        .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    }
  });
});

function world([u, v]: Vec2, frame: BuildingGrid): Vec2 {
  const c = Math.cos(frame.angle), s = Math.sin(frame.angle);
  return [frame.origin[0] + u * c - v * s, frame.origin[1] + u * s + v * c];
}

/** Small-grid reference enumerates every rectangle, independently of the search. */
function exhaustive(outline: Polygon, required: HostingProfile, frame: BuildingGrid): Polygon | null {
  const box = bounds(outline.map(([x, y]) => [x / frame.spacing, y / frame.spacing]));
  let best: { footprint: Polygon; cells: number; short: number; u: number; v: number; width: number } | undefined;
  for (let u = Math.floor(box.min[0]); u < box.max[0]; u++) {
    for (let v = Math.floor(box.min[1]); v < box.max[1]; v++) {
      for (let right = u + 1; right <= Math.ceil(box.max[0]); right++) {
        for (let top = v + 1; top <= Math.ceil(box.max[1]); top++) {
          const width = (right - u) * frame.spacing, depth = (top - v) * frame.spacing;
          const short = Math.min(width, depth), long = Math.max(width, depth);
          if (short < required.band || short < 9.74 || long < 11.14) continue;
          if (width * depth > 460 && long < 17.64 && !(short >= 13.14 && long >= 13.74)) continue;
          if (required.heavy && (short < 13.14 || long < 13.74)) continue;
          const cells = (right - u) * (top - v);
          if (best && (best.cells - cells || best.short - short || u - best.u || v - best.v || best.width - width) >= 0) continue;
          const footprint = [[u, v], [right, v], [right, top], [u, top]]
            .map(([x, y]) => world([x * frame.spacing, y * frame.spacing], frame));
          const gap = rectangleCoverageGap(outline, [u * frame.spacing, v * frame.spacing],
            [right * frame.spacing, top * frame.spacing]);
          if (width * depth < required.keep * area(outline) || gap > 128 * Number.EPSILON * width * depth) continue;
          best = { footprint, cells, short, u, v, width };
        }
      }
    }
  }
  return best?.footprint ?? null;
}
