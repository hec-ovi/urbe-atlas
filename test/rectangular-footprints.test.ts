import { describe, expect, it } from 'vitest';
import { generateCity } from '../src';
import type { AtlasParams } from '../schema/params';
import { offset } from '../src/geom/clip';
import { area } from '../src/geom/polygon';
import { coreFit } from '../src/zoning/core';
import { isHeavy } from '../src/zoning/bands';
import { setback } from '../src/zoning/profiles';
import { rectangleCoverageGap } from './rectangleCoverage';
import type { Vec2 } from '../schema/blueprint';

const params: AtlasParams = {
  seed: 'interior-review-1km-01', size: { width: 1000, depth: 1000 }, maxFloors: 8,
  features: { highways: false, trains: false, subways: false, alleys: true },
};

describe('rectangular building construction', () => {
  it('fits all default footprints to the published grid, setbacks and core requirements', () => {
    const city = generateCity(params);
    expect(city.meta.params.footprintShape).toBe('rectangle');
    expect(city.meta.buildingGrid).toEqual({ origin: [0, 0], angle: city.meta.gridAngle, spacing: 0.5 });
    const grid = city.meta.buildingGrid!;
    const c = Math.cos(grid.angle), s = Math.sin(grid.angle);
    const toGrid = ([x, z]: Vec2): Vec2 => {
      x -= grid.origin[0]; z -= grid.origin[1];
      return [x * c + z * s, -x * s + z * c];
    };
    expect(Math.abs(s)).toBeGreaterThan(0.01);
    expect(city.parcels.length).toBeGreaterThan(0);
    for (const parcel of city.parcels) {
      expect(parcel.footprint).toHaveLength(4);
      const local = parcel.footprint.map(([x, z]) => {
        const point = toGrid([x, z]);
        const roundoff = 16 * Number.EPSILON * Math.max(1, Math.abs(x), Math.abs(z));
        for (const coordinate of point) {
          expect(Math.abs(coordinate - Math.round(coordinate / grid.spacing) * grid.spacing)).toBeLessThanOrEqual(roundoff);
        }
        const cells = point.map((coordinate) => Math.round(coordinate / grid.spacing));
        const u = cells[0] * grid.spacing, v = cells[1] * grid.spacing;
        expect([x, z]).toEqual([grid.origin[0] + u * c - v * s, grid.origin[1] + u * s + v * c]);
        return cells;
      });
      const u = [...new Set(local.map((point) => point[0]))];
      const v = [...new Set(local.map((point) => point[1]))];
      expect(u).toHaveLength(2);
      expect(v).toHaveLength(2);
      expect(new Set(local.map((point) => point.join(','))).size).toBe(4);
      const min: Vec2 = [Math.min(...u) * grid.spacing, Math.min(...v) * grid.spacing];
      const max: Vec2 = [Math.max(...u) * grid.spacing, Math.max(...v) * grid.spacing];
      const plateArea = (max[0] - min[0]) * (max[1] - min[1]);
      const gap = Math.min(...offset([parcel.lot], -setback(parcel.type))
        .map((inset) => rectangleCoverageGap(inset.map(toGrid), min, max)));
      expect(gap).toBeLessThanOrEqual(128 * Number.EPSILON * plateArea);
      expect(area(parcel.footprint)).toBeLessThan(area(parcel.lot));
      const fit = coreFit(parcel.footprint);
      expect(fit.floorCap).toBeGreaterThanOrEqual(parcel.envelope.maxFloors);
      if (isHeavy(parcel.type)) expect(fit.compact).toBe(true);
    }
    // Irregular land remains owned by the parcel outside the rectangular building.
    expect(city.parcels.some((parcel) => parcel.lot.length > 4)).toBe(true);
  });

  it('uses lot-following footprints only when explicitly requested without changing reserved street land', () => {
    const rectangle = generateCity(params);
    const parcel = generateCity({ ...params, footprintShape: 'parcel' });
    expect(parcel.meta.params.footprintShape).toBe('parcel');
    expect(parcel.parcels.some((item) => item.footprint.length > 4)).toBe(true);
    expect(parcel.streets.edges).toEqual(rectangle.streets.edges);
    const blockLand = (city: typeof rectangle) => city.blocks.map(({ boundary, curb, sidewalk }) => ({ boundary, curb, sidewalk }));
    expect(blockLand(parcel)).toEqual(blockLand(rectangle));
  });

  it('rejects unknown footprint policies at the public input', () => {
    for (const footprintShape of ['round', null, 1]) {
      expect(() => generateCity({ ...params, footprintShape } as AtlasParams))
        .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    }
  });

  it('keeps core-valid square plates buildable far from the world origin', () => {
    const city = generateCity({ seed: 'urbe', size: { width: 3000, depth: 3000 } });
    const square = city.parcels.find(({ footprint }) => {
      const edge = (index: number) => Math.hypot(footprint[(index + 1) % 4][0] - footprint[index][0],
        footprint[(index + 1) % 4][1] - footprint[index][1]);
      return footprint[0][0] > 1000 && Math.abs(edge(0) - edge(1)) < 1e-6;
    });
    expect(square).toBeDefined();
    expect(coreFit(square!.footprint).floorCap).toBeGreaterThan(0);
  }, 30000); // One full 3 km generation, including all geometry invariants.
});
