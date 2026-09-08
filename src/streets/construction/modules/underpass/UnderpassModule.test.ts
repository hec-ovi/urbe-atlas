import { expect, it } from 'vitest';
import { difference, intersection } from '../../../../geom/clip';
import { area, bounds, coversPath, isSimpleRing } from '../../../../geom/polygon';
import { ModuleGround } from '../ModuleGround';
import type { ModulePrism } from '../schema';
import { UnderpassModule } from './index';
import type { UnderpassInput } from './schema';

it('builds complete physical owners with open sidewalk connections for equal and unequal widths', () => {
  const inputs: UnderpassInput[] = [
    { startWidth: 2, endWidth: 2, startReturn: 2, endReturn: 6, span: 14 },
    { startWidth: 6, endWidth: 2, startReturn: 4, endReturn: 2, span: 14 },
    { startWidth: 2, endWidth: 6, startReturn: 6, endReturn: 4, span: 1 },
  ];
  for (const input of inputs) {
    const template = UnderpassModule.build(input), parts = template.definition.parts;
    const length = input.startReturn + input.span + 1 + input.endReturn;
    expect(UnderpassModule.build(input)).toEqual(template);
    expect(isSimpleRing(template.boundary)).toBe(true);
    expect(bounds(template.boundary)).toEqual({ min: [0, -0.5], max: [length, Math.max(input.startWidth, input.endWidth, Math.min(input.startWidth, input.endWidth) + 0.5)] });
    const ownerArea = (input.startReturn + 0.5) * (input.startWidth + 0.5)
      + (input.endReturn + 0.5) * (input.endWidth + 0.5) + input.span * (Math.min(input.startWidth, input.endWidth) + 1);
    expect(area(template.boundary)).toBe(ownerArea);
    for (const part of parts) {
      expect(isSimpleRing(part.polygon), `${template.definition.id}/${part.role}`).toBe(true);
      expect(area(part.polygon)).toBeGreaterThan(0);
      expect(part.top).toBeGreaterThan(part.bottom);
    }
    const cover = ModuleGround.cover({ version: '1.0.0', definitions: [template.definition],
      placements: [{ moduleId: template.definition.id, blockId: 'underpass', origin: [0, 0], turn: 0,
        count: 1, step: 0, finish: 'concrete' }] });
    const beds = cover.map(region => region.polygon);
    expect(difference([template.boundary], beds)).toEqual([]);
    expect(difference(beds, [template.boundary])).toEqual([]);
    expect(beds.reduce((sum, polygon) => sum + area(polygon), 0)).toBeCloseTo(area(template.boundary), 8);
    for (let i = 0; i < beds.length; i++) expect(intersection([beds[i]], beds.slice(i + 1))).toEqual([]);
    const paved = cover.filter(region => region.surface === 'sidewalk');
    expect(paved).toHaveLength(1);
    const width = Math.min(input.startWidth, input.endWidth);
    expect(coversPath(paved[0].polygon, [[0, width / 2], [length, width / 2]])).toBe(true);
    for (const path of [
      [[0, 0], [0, input.startWidth]], [[length, 0], [length, input.endWidth]],
      [[0, input.startWidth], [input.startReturn, input.startWidth]],
      [[length - input.endReturn, input.endWidth], [length, input.endWidth]],
    ] as [number, number][][]) expect(coversPath(paved[0].polygon, path)).toBe(true);
    const bodySurface = { panel: 'sidewalk', curb: 'curb', gutter: 'gutter', 'gutter-lip': 'gutter' } as const;
    for (const [role, surface] of Object.entries(bodySurface)) {
      const bodies = parts.filter(part => part.role === role);
      expect(bodies.length).toBeGreaterThan(0);
      expect(difference(bodies.map(part => part.polygon), cover.filter(region => region.surface === surface).map(region => region.polygon))).toEqual([]);
    }
    const panels = parts.filter(part => part.role === 'panel');
    expect(panels).toHaveLength(Math.round(area(paved[0].polygon)));
    for (const panel of panels) expect(area(panel.polygon)).toBeCloseTo(0.988 ** 2, 8);
  }
});

it('keeps recessed beds, full-width curb bands, gutter lips and physical station joints', () => {
  const { definition } = UnderpassModule.build({ startWidth: 4, endWidth: 4, startReturn: 4, endReturn: 4, span: 14 });
  const front = (role: ModulePrism['role']) => definition.parts.find(part => {
    const box = bounds(part.polygon);
    return part.role === role && box.min[0] === 0.006 && box.max[0] === 1.994 && box.max[1] <= 0;
  })!;
  const curb = front('curb'), gutter = front('gutter'), lip = front('gutter-lip');
  expect(bounds(curb.polygon)).toEqual({ min: [0.006, -0.2], max: [1.994, 0] });
  expect(bounds(gutter.polygon)).toEqual({ min: [0.006, -0.48], max: [1.994, -0.2] });
  expect(bounds(lip.polygon)).toEqual({ min: [0.006, -0.5], max: [1.994, -0.48] });
  expect([curb.bottom, curb.top, gutter.bottom, gutter.top, lip.bottom, lip.top]).toEqual([0.18, 0.2, -0.008, 0, -0.008, 0.02]);
  const cover = ModuleGround.cover({ version: '1.0.0', definitions: [definition], placements: [
    { moduleId: definition.id, blockId: 'underpass', origin: [0, 0], turn: 0, count: 1, step: 0, finish: 'concrete' },
  ] });
  expect(cover.find(region => region.surface === 'sidewalk')).toMatchObject({ bottom: 0, top: 0.2 });
  expect(cover.find(region => region.surface === 'curb')).toMatchObject({ bottom: -0.03, top: 0.2 });
  expect(cover.find(region => region.surface === 'gutter')).toMatchObject({ bottom: -0.03, top: 0 });
});

it('rejects unsupported sidewalk dimensions and non-whole or unsafe spans', () => {
  const input: UnderpassInput = { startWidth: 2, endWidth: 4, startReturn: 6, endReturn: 2, span: 14 };
  expect(() => UnderpassModule.build({ ...input, startWidth: 3 as 2 })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  for (const span of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    expect(() => UnderpassModule.build({ ...input, span })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  }
});
