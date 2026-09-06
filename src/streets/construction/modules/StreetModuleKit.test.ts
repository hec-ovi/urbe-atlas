import { describe, expect, it } from 'vitest';
import { StreetModuleKit } from './StreetModuleKit';
import { ModuleGround } from './ModuleGround';
import type { BlockModuleInput, ModuleConstruction } from './schema';
import type { Polygon, Vec2 } from '../../../../schema/blueprint';

const input: BlockModuleInput = {
  id: 'b0', origin: [10, 20], panels: [40, 32], sidewalks: [2, 4, 6, 4], finish: 'maintained', guardrails: true,
};
const signedArea = (polygon: Polygon) => polygon.reduce((sum, p, i) => {
  const q = polygon[(i + 1) % polygon.length];
  return sum + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;
const box = (polygon: Polygon) => ({ min: [Math.min(...polygon.map(p => p[0])), Math.min(...polygon.map(p => p[1]))],
  max: [Math.max(...polygon.map(p => p[0])), Math.max(...polygon.map(p => p[1]))] });

function baseArea(construction: ModuleConstruction): number {
  const definitions = new Map(construction.definitions.map(definition => [definition.id, definition]));
  return construction.placements.reduce((sum, placement) => sum + placement.count * definitions.get(placement.moduleId)!.parts
    .filter(part => part.role === 'joint' || part.role === 'roadway')
    .reduce((area, part) => area + signedArea(part.polygon), 0), 0);
}

describe('StreetModuleKit public construction', () => {
  it('builds complete dimensioned blocks from shared panels, curb groups, gutter beds and lips', () => {
    const kit = new StreetModuleKit();
    const block = kit.block(input);
    const construction = kit.construction();
    expect(block.outer).toEqual([[9.5, 19.5], [50.5, 19.5], [50.5, 52.5], [9.5, 52.5]]);
    expect(block.interior).toEqual([[14, 22], [46, 22], [46, 46], [14, 46]]);
    expect(baseArea(construction)).toBeCloseTo(signedArea(block.outer) - signedArea(block.interior), 8);
    for (const definition of construction.definitions) {
      for (const part of definition.parts) {
        expect(part.polygon.length).toBeGreaterThanOrEqual(3);
        expect(signedArea(part.polygon), `${definition.id}/${part.role}`).toBeGreaterThan(0);
        expect(part.bottom).toBeLessThan(part.top);
        expect(part.polygon.flat().every(Number.isFinite)).toBe(true);
      }
    }
    for (const width of [2, 4, 6]) {
      const straight = construction.definitions.find(definition => definition.id === `straight:${width}:unit`)!;
      const panels = straight.parts.filter(part => part.role === 'panel');
      expect(panels).toHaveLength(width * 2);
      for (const part of panels) {
        const bounds = box(part.polygon);
        expect(bounds.max[0] - bounds.min[0]).toBeCloseTo(0.988, 12);
        expect(bounds.max[1] - bounds.min[1]).toBeCloseTo(0.988, 12);
        expect(part.top).toBe(0.2);
      }
      const curb = straight.parts.find(part => part.role === 'curb')!;
      const gutter = straight.parts.find(part => part.role === 'gutter')!;
      const lip = straight.parts.find(part => part.role === 'gutter-lip')!;
      expect(box(curb.polygon).min[0]).toBe(box(gutter.polygon).min[0]);
      expect(box(curb.polygon).max[0]).toBe(box(gutter.polygon).max[0]);
      expect(box(curb.polygon).min[1]).toBe(-0.2);
      expect(box(gutter.polygon).max[1]).toBeCloseTo(-0.2, 12);
      expect(box(lip.polygon).min[1]).toBe(-0.5);
      expect(lip.top).toBe(0.02);
    }
  });

  it('uses the same small catalog for further blocks and preserves owned output', () => {
    const kit = new StreetModuleKit();
    kit.block(input);
    const first = kit.construction();
    kit.block({ ...input, id: 'b1', origin: [100, 200], panels: [80, 64] });
    expect(kit.construction().definitions).toEqual(first.definitions);
    first.definitions[0].parts[0].polygon[0][0] = 9000;
    expect(kit.construction().definitions[0].parts[0].polygon[0][0]).not.toBe(9000);
    const repeat = new StreetModuleKit();
    repeat.block(input);
    repeat.block({ ...input, id: 'b1', origin: [100, 200], panels: [80, 64] });
    expect(repeat.construction()).toEqual(kit.construction());
  });

  it('keeps every panel, curb and gutter body inside its supporting bed facets', () => {
    const kit = new StreetModuleKit();
    kit.block(input);
    const contains = (polygon: Polygon, point: Vec2) => polygon.every((a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]) >= -1e-12;
    });
    for (const definition of kit.construction().definitions) {
      for (const body of definition.parts.filter(part => ['panel', 'curb', 'gutter', 'gutter-lip'].includes(part.role))) {
        const supported = definition.parts.some(bed => bed.role === 'joint' && bed.top === body.bottom
          && body.polygon.every(point => contains(bed.polygon, point)));
        expect(supported, `${definition.id}/${body.role}`).toBe(true);
      }
    }
  });

  it('publishes one physical middle panel and keeps guardrails clear of reserved access', () => {
    const kit = new StreetModuleKit();
    kit.block({ ...input, centerDouble: true, reserved: [[[6, 8]], [], [], []] });
    const construction = kit.construction();
    const broad = construction.definitions.find(definition => definition.id === 'straight:6:middle')!;
    const middle = broad.parts.filter(part => part.role === 'panel' && box(part.polygon).max[0] - box(part.polygon).min[0] > 1);
    expect(middle).toHaveLength(1);
    expect(box(middle[0].polygon)).toEqual({ min: [0.006, 2.006], max: [1.994, 3.994] });
    const rails = construction.placements.filter(placement => placement.moduleId === 'guardrail:2');
    expect(rails.length).toBeGreaterThan(0);
    expect(rails.some(placement => placement.turn === 0 && placement.origin[0] === 20)).toBe(false);
    for (const part of construction.definitions.find(definition => definition.id === 'guardrail:2')!.parts) {
      expect(part.bottom).toBeGreaterThanOrEqual(0.2);
      expect(box(part.polygon).min[1]).toBeGreaterThan(0);
      expect(box(part.polygon).max[1]).toBeLessThan(1);
    }
  });

  it('rejects unsupported dimensions and reservations without changing its catalog', () => {
    const kit = new StreetModuleKit();
    expect(() => kit.block({ ...input, panels: [39, 32] })).toThrow(/whole even panel/);
    expect(() => kit.block({ ...input, origin: [NaN, 0] })).toThrow(/finite coordinates/);
    expect(() => kit.block({ ...input, reserved: [[[8, 6] as Vec2], [], [], []] })).toThrow(/finite coordinates/);
    expect(kit.construction()).toEqual({ version: '1.0.0', definitions: [], placements: [] });
  });

  it('cuts parking from wide sidewalks with whole slots, shared returns and a continuous walking strip', () => {
    const kit = new StreetModuleKit();
    const block = kit.block({ ...input, panels: [80, 64], parking: [
      { side: 1, start: 8, slots: 2 }, { side: 2, start: 16, slots: 3 },
    ] });
    const construction = kit.construction();
    expect(baseArea(construction)).toBeCloseTo(signedArea(block.outer) - signedArea(block.interior), 8);
    expect(construction.parking?.map(bay => [bay.side, bay.start, bay.end, bay.slotCount])).toEqual([[1, 8, 20, 2], [2, 16, 32, 3]]);
    for (const bay of construction.parking!) {
      expect(bay.slots).toHaveLength(bay.slotCount);
      expect(bay.slots.map(signedArea)).toEqual(Array(bay.slotCount).fill(8));
    }
    for (const definition of construction.definitions.filter(definition => definition.id.startsWith('parking:'))) {
      const length = Math.max(...definition.parts.flatMap(part => part.polygon.map(p => p[0])));
      for (const part of definition.parts) {
        expect(signedArea(part.polygon), `${definition.id}/${part.role}`).toBeGreaterThan(0);
        const bounds = box(part.polygon);
        if (part.role === 'panel' && bounds.min[0] >= 2 && bounds.max[0] <= length - 2) {
          expect(bounds.min[1]).toBeGreaterThanOrEqual(2);
        }
      }
    }
    expect(() => new StreetModuleKit().block({ ...input, parking: [{ side: 0, start: 6, slots: 1 }] })).toThrow();
    expect(() => new StreetModuleKit().block({ ...input, panels: [80, 64], reserved: [[], [[8, 10]], [], []],
      parking: [{ side: 1, start: 8, slots: 2 }],
    })).toThrow();
  });

  it('publishes compact planning cover over the same whole block and parking cuts', () => {
    const kit = new StreetModuleKit();
    const block = kit.block({ ...input, panels: [80, 64], parking: [{ side: 1, start: 8, slots: 2 }] });
    const construction = kit.construction();
    const cover = ModuleGround.cover(construction);
    expect(cover.every(region => region.blockId === input.id)).toBe(true);
    expect(new Set(cover.map(region => region.surface))).toEqual(new Set(['sidewalk', 'curb', 'gutter', 'roadway']));
    expect(cover.reduce((sum, region) => sum + signedArea(region.polygon), 0))
      .toBeCloseTo(signedArea(block.outer) - signedArea(block.interior), 6);
    expect(cover.length).toBeLessThan(60);
    expect(ModuleGround.cover(construction)).toEqual(cover);
  });
});
