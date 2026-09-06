import { expect, it } from 'vitest';
import { DiagonalBlock } from './DiagonalBlock';
import { area, isSimpleRing } from '../../../../geom/polygon';
import { difference, intersection } from '../../../../geom/clip';
import { ModuleGround } from '../ModuleGround';
import { rectangle } from '../Geometry';

it('constructs complete 30/45 degree block templates with physical panels and disjoint land', () => {
  for (const angle of [30, 45] as const) {
    const input = { width: 121, depth: 113, sidewalks: [4, 4, 4, 4] as [4, 4, 4, 4], angle,
      roadWidth: angle === 30 ? 4 : 7, diagonalSidewalk: 2 as const, reach: 72 };
    const template = DiagonalBlock.build(input);
    expect(DiagonalBlock.build(input)).toEqual(template);
    expect(template.interiors).toHaveLength(2);
    expect(Math.atan2(template.axis.normal[0], template.axis.normal[1]) * 180 / Math.PI).toBeCloseTo(angle, 10);
    expect(template.definition.parts.filter(part => part.role === 'panel' && Math.abs(area(part.polygon) - 0.988 ** 2) < 0.002).length).toBeGreaterThan(50);
    for (const part of template.definition.parts) {
      expect(isSimpleRing(part.polygon), `${angle}/${part.role}`).toBe(true);
      expect(area(part.polygon)).toBeGreaterThan(0);
      expect(part.top).toBeGreaterThan(part.bottom);
    }
    const cover = ModuleGround.cover({ version: '1.0.0', definitions: [template.definition],
      placements: [{ moduleId: template.definition.id, blockId: 'b0', origin: [0, 0], turn: 0, count: 1, step: 2, finish: 'plain' }] });
    const regions = [...cover.map(region => region.polygon), ...template.interiors];
    expect(difference([rectangle(0, 0, input.width, input.depth)], regions)).toEqual([]);
    expect(regions.reduce((sum, polygon) => sum + area(polygon), 0)).toBeCloseTo(input.width * input.depth, 5);
    expect(intersection(template.interiors, cover.map(region => region.polygon))).toEqual([]);
  }
});

it('rejects undeclared angles and blocks without room for the complete cut', () => {
  const input = { width: 121, depth: 113, sidewalks: [2, 2, 2, 2] as [2, 2, 2, 2], angle: 30 as const,
    roadWidth: 4, diagonalSidewalk: 2 as const, reach: 72 };
  expect(() => DiagonalBlock.build({ ...input, angle: 37 as 30 })).toThrow(/30\/45/);
  expect(() => DiagonalBlock.build({ ...input, reach: 5 })).toThrow(/land|returns/);
});
