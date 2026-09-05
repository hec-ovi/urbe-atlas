import { expect, it } from 'vitest';
import { generateCity } from '../src';
import { GRID_STEP } from '../src/geom/clip';
import { regularCityParams } from './fixtures/regular-city';

it('keeps regular motor-street headings within authored precision through graph assembly', () => {
  const city = generateCity(regularCityParams);
  const cosine = Math.cos(city.meta.gridAngle), sine = Math.sin(city.meta.gridAngle);
  const snapError = GRID_STEP / Math.SQRT2;
  const sourceSlope = snapError / (10 - snapError);
  let checked = 0;
  for (const edge of city.streets.edges) {
    for (let i = 1; i < edge.path.length; i++) {
      const a = edge.path[i - 1], b = edge.path[i];
      const x = b[0] - a[0], z = b[1] - a[1];
      const across = Math.min(Math.abs(x * cosine + z * sine), Math.abs(-x * sine + z * cosine));
      const precision = Math.hypot(x, z) * sourceSlope + 4 * snapError * (1 + sourceSlope);
      expect(across, `${edge.id} segment ${i - 1}`).toBeLessThanOrEqual(precision);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(0);
  expect(city.blocks.length).toBeGreaterThan(0);
  expect(city.parcels.length).toBeGreaterThan(0);
  expect(city.streets.nodes.some(node => node.edgeIds.length === 3)).toBe(true);
});
