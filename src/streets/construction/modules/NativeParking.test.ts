import { describe, expect, it } from 'vitest';
import type { Polygon } from '../../../../schema/blueprint';
import { difference, intersection, union } from '../../../geom/clip';
import { area } from '../../../geom/polygon';
import { ModuleGround } from './ModuleGround';
import { StreetModuleKit } from './StreetModuleKit';
import type { BlockModuleInput } from './schema';

const input: BlockModuleInput = { id: 'b0', origin: [10, 20], panels: [80, 64], sidewalks: [6, 6, 6, 6],
  finish: 'maintained', parking: [{ side: 1, start: 8, slots: 2, profile: 'native' }],
  guardrails: [{ side: 1, start: 8, segments: 2 }, { side: 2, start: 8, segments: 1 }] };
const sum = (polygons: Polygon[]) => polygons.reduce((total, polygon) => total + area(polygon), 0);

describe('native parking through StreetModuleKit', () => {
  it('publishes six-metre slots and diagonal bays with the same physical and planning ownership', () => {
    const kit = new StreetModuleKit();
    const block = kit.block(input), construction = kit.construction();
    const bay = construction.parking![0];
    expect(bay.profile).toBe('native');
    if (bay.profile !== 'native') throw new Error('native parking required');
    expect([bay.slotLength, bay.width, bay.endRun, bay.walkingClearance]).toEqual([6, 2.5, 2, 3.5]);
    expect(block.planning!.frontages.some(frontage => frontage.id === bay.frontageId)).toBe(true);
    expect(bay.end - bay.start).toBe(16);
    expect(bay.support).toEqual({ start: 6, end: 26 });
    expect(bay.slots.map(area)).toEqual([15, 15]);
    expect(difference(bay.slots, [bay.footprint])).toEqual([]);
    expect(area(bay.footprint)).toBe(35);
    const cover = ModuleGround.cover(construction);
    expect(sum(cover.map(region => region.polygon))).toBeCloseTo(area(block.outer) - area(block.interior), 7);
    expect(difference([bay.footprint], cover.filter(region => region.surface === 'roadway').map(region => region.polygon))).toEqual([]);
    expect(intersection([bay.footprint], cover.filter(region => region.surface === 'sidewalk').map(region => region.polygon))).toEqual([]);
    expect(sum(union(cover.map(region => region.polygon)))).toBeCloseTo(sum(cover.map(region => region.polygon)), 7);
    expect(intersection(cover.map(region => region.polygon), [block.interior])).toEqual([]);
    const rails = construction.placements.filter(placement => placement.moduleId === 'guardrail:2');
    expect(rails.map(rail => rail.turn)).toEqual([2]);
    expect(construction.definitions.find(definition => definition.id.startsWith('parking-native:'))!.parts
      .some(part => part.role === 'marking')).toBe(false);
    const repeated = new StreetModuleKit(); repeated.block(input);
    expect(repeated.construction()).toEqual(construction);
    bay.footprint[0][0] += 1;
    expect(kit.construction()).toEqual(repeated.construction());
  });

  it('rejects insufficient walking width, corner support clearance and overlapping reservations', () => {
    for (const invalid of [
      { ...input, sidewalks: [6, 4, 6, 6] as BlockModuleInput['sidewalks'] },
      { ...input, parking: [{ side: 1 as const, start: 6, slots: 2 as const, profile: 'native' as const }] },
      { ...input, parking: [{ side: 1 as const, start: 28, slots: 3 as const, profile: 'native' as const }] },
      { ...input, reserved: [[], [[6, 7]], [], []] as BlockModuleInput['reserved'] },
    ]) expect(() => new StreetModuleKit().block(invalid)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  });
});
