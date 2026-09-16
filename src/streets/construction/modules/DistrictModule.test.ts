import { expect, it } from 'vitest';
import { StreetModuleKit } from './StreetModuleKit';
import { ModuleGround } from './ModuleGround';
import { area, signedArea } from '../../../geom/polygon';
import { difference, intersection, union } from '../../../geom/clip';
import type { Polygon } from '../../../../schema/blueprint';
import type { BlockModuleInput, ModuleConstruction, ModuleFormat } from './schema';

const input: BlockModuleInput = { id: 'b0', origin: [10, 20], panels: [80, 64], sidewalks: [4, 4, 4, 4],
  finish: 'luxury-blue', centerDouble: true, parking: [{ side: 0, start: 8, slots: 2, profile: 'native' }] };
const sum = (rings: Polygon[]) => rings.reduce((result, ring) => result + area(ring), 0);
const span = (ring: Polygon, axis: number) => Math.max(...ring.map(p => p[axis])) - Math.min(...ring.map(p => p[axis]));
const validPrisms = (construction: ModuleConstruction) => {
  for (const definition of construction.definitions) for (const part of definition.parts) {
    expect(part.polygon.length).toBeGreaterThanOrEqual(3);
    expect(signedArea(part.polygon), `${definition.id}/${part.role}`).toBeGreaterThan(0);
    expect(part.bottom).toBeLessThan(part.top);
    expect(part.polygon.flat().every(Number.isFinite)).toBe(true);
  }
};

it('publishes whole district modules and two-metre parking over exactly one physical block partition', () => {
  const kit = new StreetModuleKit('district'), block = kit.block(input), construction = kit.construction();
  validPrisms(construction);
  expect(construction.format).toBe('district');
  expect(block.planning!.frontages.map(front => [front.pavedWidth, front.curbWidth, front.gutterWidth]))
    .toEqual(Array.from({ length: 4 }, () => [4.2, 0.2, 0.5]));
  expect(span(block.interior, 0)).toBeCloseTo(72, 10);
  expect(span(block.outer, 0)).toBeCloseTo(81.8, 10);
  const cover = ModuleGround.cover(construction), rings = cover.map(field => field.polygon);
  expect(sum(rings)).toBeCloseTo(area(block.outer) - area(block.interior), 7);
  expect(sum(union(rings))).toBeCloseTo(sum(rings), 7);
  expect(intersection(rings, [block.interior])).toEqual([]);
  const bay = construction.parking![0];
  if (bay.profile !== 'native') throw new Error('Native parking expected');
  expect([bay.width, bay.walkingClearance, bay.slotLength]).toEqual([2, 2.2, 6]);
  expect(bay.slots).toHaveLength(2);
  for (const slot of bay.slots) expect(area(slot)).toBeCloseTo(12, 10);
  expect(difference([bay.footprint], cover.filter(field => field.surface === 'roadway').map(field => field.polygon))).toEqual([]);
  const panels = construction.definitions.find(definition => definition.id === 'straight:4:middle:district')!.parts.filter(part => part.role === 'panel');
  expect(panels.map(part => [Number(span(part.polygon, 0).toFixed(3)), Number(span(part.polygon, 1).toFixed(3))]))
    .toEqual([[0.988, 0.988], [0.988, 0.988], [0.988, 0.988], [0.988, 0.988], [1.988, 1.988], [1.988, 0.188]]);
  const repeated = new StreetModuleKit('district'); repeated.block(input);
  expect(repeated.construction()).toEqual(construction);
});

it('closes outer district sidewalks around fractional road spans without gaps or overlaps', () => {
  const kit = new StreetModuleKit('district');
  const bounds = { min: [10.1, 20.1] as [number, number], max: [112.3, 99.9] as [number, number] };
  const outside = kit.perimeter({ id: 'fringe', bounds, width: 4, finish: 'luxury-blue' });
  const construction = kit.construction(), cover = ModuleGround.cover(construction), rings = cover.map(field => field.polygon);
  validPrisms(construction);
  const roadArea = (bounds.max[0] - bounds.min[0]) * (bounds.max[1] - bounds.min[1]);
  expect(sum(rings)).toBeCloseTo(area(outside.boundary) - roadArea, 7);
  expect(sum(union(rings))).toBeCloseTo(sum(rings), 7);
  expect(difference(rings, [outside.boundary])).toEqual([]);
});

it('rejects unsupported district widths and formats before publishing geometry', () => {
  expect(() => new StreetModuleKit('unknown' as ModuleFormat)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  const kit = new StreetModuleKit('district');
  expect(() => kit.block({ ...input, sidewalks: [6, 4, 4, 4] })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  expect(() => kit.block({ ...input, parking: [{ side: 0, start: 8, slots: 2 }] })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  for (const max of [[10.001, 20], [10.2001, 20]] as [number, number][]) {
    expect(() => kit.perimeter({ id: 'fringe', bounds: { min: [0, 0], max }, width: 4, finish: 'luxury-blue' }))
      .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  }
  expect(kit.construction().placements).toEqual([]);
});
