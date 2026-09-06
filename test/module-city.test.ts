import { expect, it } from 'vitest';
import { generateCity, BLUEPRINT_VERSION } from '../src';
import type { GenerationProgress } from '../schema/progress';

it('generates a deterministic city from shared whole-panel streets through the public entry', () => {
  const params = { seed: 'panel-contract', size: { width: 400, depth: 400 },
    features: { highways: false, trains: false, subways: false } };
  const progress: GenerationProgress[] = [];
  const city = generateCity(params, stage => progress.push(stage));
  expect(city.meta.version).toBe(BLUEPRINT_VERSION);
  expect(city.meta.gridAngle).toBe(0);
  expect(city.meta.boundary).toEqual([[0, 0], [400, 0], [400, 400], [0, 400]]);
  expect(city.parcels.length).toBeGreaterThan(0);
  for (const edge of city.streets.edges) {
    expect(edge.path).toHaveLength(2);
    const [a, b] = edge.path;
    expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
  }
  for (const district of city.districts) {
    district.boundary.forEach((a, index, ring) => {
      const b = ring[(index + 1) % ring.length];
      expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
    });
  }
  const modules = city.streets.construction!.modules!;
  expect(modules.placements.length).toBeGreaterThan(modules.definitions.length);
  expect(modules.frontages).toHaveLength(1);
  expect(modules.definitions.flatMap(item => item.parts.map(part => part.role)))
    .toEqual(expect.arrayContaining(['panel', 'joint', 'curb', 'gutter', 'gutter-lip']));
  expect(city.volumetric.ground.some(item => item.surface === 'gutter' && item.moduleBlockId)).toBe(true);
  expect(progress.map(stage => stage.completed)).toEqual(Array.from({ length: 13 }, (_, index) => index));
  expect(JSON.stringify(generateCity(params))).toBe(JSON.stringify(city));
}, 15000);
