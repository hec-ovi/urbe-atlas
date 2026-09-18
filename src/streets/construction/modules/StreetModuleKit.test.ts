import { describe, expect, it } from 'vitest';
import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { difference, intersection, union } from '../../../geom/clip';
import { area, bounds, coversPath, isSimpleRing, signedArea } from '../../../geom/polygon';
import { ModuleGround } from './ModuleGround';
import { StreetModuleKit } from './StreetModuleKit';
import { UnderpassModule } from './underpass/index';
import type { UnderpassInput } from './underpass/schema';
import type { BlockModuleInput, ModuleConstruction, ModuleFormat, ModulePrism } from './schema';

const input: BlockModuleInput = {
  id: 'b0', origin: [10, 20], panels: [40, 32], sidewalks: [2, 4, 6, 4], finish: 'maintained',
  guardrails: [{ side: 0, start: 6, segments: 2 }, { side: 1, start: 6, segments: 1 }],
};

const sum = (polygons: Polygon[]) => polygons.reduce((total, polygon) => total + area(polygon), 0);
const span = (polygon: Polygon, axis: number) => bounds(polygon).max[axis] - bounds(polygon).min[axis];

/** Land covered once by the joint beds and roadway aprons of every placed module. */
function baseArea(construction: ModuleConstruction): number {
  const definitions = new Map(construction.definitions.map(definition => [definition.id, definition]));
  return construction.placements.reduce((total, placement) => total + placement.count * definitions.get(placement.moduleId)!.parts
    .filter(part => part.role === 'joint' || part.role === 'roadway')
    .reduce((covered, part) => covered + signedArea(part.polygon), 0), 0);
}

function validPrisms(construction: ModuleConstruction): void {
  for (const definition of construction.definitions) for (const part of definition.parts) {
    expect(part.polygon.length).toBeGreaterThanOrEqual(3);
    expect(signedArea(part.polygon), `${definition.id}/${part.role}`).toBeGreaterThan(0);
    expect(part.bottom).toBeLessThan(part.top);
    expect(part.polygon.flat().every(Number.isFinite)).toBe(true);
  }
}

describe('StreetModuleKit public construction', () => {
  it('builds dimensioned blocks from one shared catalog of panels, curbs, gutters and lips', () => {
    const kit = new StreetModuleKit();
    const block = kit.block(input);
    const construction = kit.construction();
    validPrisms(construction);
    for (const frontage of block.planning!.frontages) {
      const [first, last] = frontage.cornerIds.map(id => block.planning!.corners.find(corner => corner.id === id)!);
      if (first.kind !== 'explicit' || last.kind !== 'explicit') throw new Error('block corner support required');
      // The run starts where its own corner square ends and stops at the next one.
      for (const [point, corner] of [[frontage.start, first], [frontage.end, last]] as const) {
        expect(bounds(corner.boundary).min.every((n, i) => point[i] >= n - 1e-9)).toBe(true);
        expect(bounds(corner.boundary).max.every((n, i) => point[i] <= n + 1e-9)).toBe(true);
      }
      const dx = frontage.end[0] - frontage.start[0], dz = frontage.end[1] - frontage.start[1];
      expect(frontage.inward[0]).toBeCloseTo(-Math.sign(dz));
      expect(frontage.inward[1]).toBeCloseTo(Math.sign(dx));
      expect(first.placement.moduleId).toBe(`corner:${input.sidewalks[(frontage.side + 3) % 4]}:${frontage.pavedWidth}`);
      expect(construction.placements.some(placement => placement.moduleId === first.placement.moduleId
        && placement.turn === first.placement.turn && placement.origin.every((n, i) => n === first.placement.origin[i]))).toBe(true);
    }
    expect(block.outer).toEqual([[9.5, 19.5], [50.5, 19.5], [50.5, 52.5], [9.5, 52.5]]);
    expect(block.interior).toEqual([[14, 22], [46, 22], [46, 46], [14, 46]]);
    expect(baseArea(construction)).toBeCloseTo(signedArea(block.outer) - signedArea(block.interior), 8);
    for (const width of [2, 4, 6]) {
      const straight = construction.definitions.find(definition => definition.id === `straight:${width}:unit`)!;
      const panels = straight.parts.filter(part => part.role === 'panel');
      expect(panels).toHaveLength(width * 2);
      for (const part of panels) {
        expect(span(part.polygon, 0)).toBeCloseTo(0.988, 12);
        expect(span(part.polygon, 1)).toBeCloseTo(0.988, 12);
        expect(part.top).toBe(0.2);
      }
      const curb = straight.parts.find(part => part.role === 'curb')!;
      const gutter = straight.parts.find(part => part.role === 'gutter')!;
      const lip = straight.parts.find(part => part.role === 'gutter-lip')!;
      expect(bounds(curb.polygon).min[0]).toBe(bounds(gutter.polygon).min[0]);
      expect(bounds(curb.polygon).max[0]).toBe(bounds(gutter.polygon).max[0]);
      expect(bounds(curb.polygon).min[1]).toBe(-0.2);
      expect(bounds(gutter.polygon).max[1]).toBeCloseTo(-0.2, 12);
      expect(bounds(lip.polygon).min[1]).toBe(-0.5);
      expect(lip.top).toBe(0.02);
    }
    const inside = (polygon: Polygon, point: Vec2) => polygon.every((a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]) >= -1e-12;
    });
    for (const definition of construction.definitions) {
      for (const body of definition.parts.filter(part => ['panel', 'curb', 'gutter', 'gutter-lip'].includes(part.role))) {
        const supported = definition.parts.some(bed => bed.role === 'joint' && bed.top === body.bottom
          && body.polygon.every(point => inside(bed.polygon, point)));
        expect(supported, `${definition.id}/${body.role}`).toBe(true);
      }
    }
    kit.block({ ...input, id: 'b1', origin: [100, 200], panels: [80, 64] });
    expect(kit.construction().definitions).toEqual(construction.definitions);
    construction.definitions[0].parts[0].polygon[0][0] = 9000;
    expect(kit.construction().definitions[0].parts[0].polygon[0][0]).not.toBe(9000);
    const repeat = new StreetModuleKit();
    repeat.block(input);
    repeat.block({ ...input, id: 'b1', origin: [100, 200], panels: [80, 64] });
    expect(repeat.construction()).toEqual(kit.construction());
  });

  it('cuts native and plain parking bays, a middle panel and guardrails from one planning cover', () => {
    const kit = new StreetModuleKit();
    const block = kit.block({ ...input, panels: [80, 64], sidewalks: [6, 6, 6, 6], centerDouble: true,
      parking: [{ side: 1, start: 8, slots: 2, profile: 'native' }, { side: 2, start: 16, slots: 3 }],
      guardrails: [{ side: 0, start: 6, segments: 1 }, { side: 3, start: 6, segments: 2 }],
      reserved: [[[6, 8]], [], [], []] });
    const construction = kit.construction();
    expect(baseArea(construction)).toBeCloseTo(signedArea(block.outer) - signedArea(block.interior), 8);

    const [native, plain] = construction.parking!;
    if (native.profile !== 'native') throw new Error('native parking expected');
    expect([native.slotLength, native.width, native.endRun, native.walkingClearance]).toEqual([6, 2.5, 2, 3.5]);
    expect(native.support).toEqual({ start: 6, end: 26 });
    expect(native.end - native.start).toBe(16);
    expect(native.slots.map(area)).toEqual([15, 15]);
    expect(area(native.footprint)).toBe(40);
    expect(difference(native.slots, [native.footprint])).toEqual([]);
    expect(block.planning!.frontages.some(frontage => frontage.id === native.frontageId)).toBe(true);
    expect([plain.side, plain.start, plain.end, plain.slotCount]).toEqual([2, 16, 32, 3]);
    expect(plain.slots.map(signedArea)).toEqual([8, 8, 8]);

    const cover = ModuleGround.cover(construction), regions = cover.map(region => region.polygon);
    expect(cover.every(region => region.blockId === input.id)).toBe(true);
    expect(new Set(cover.map(region => region.surface))).toEqual(new Set(['sidewalk', 'curb', 'gutter', 'roadway']));
    expect(sum(regions)).toBeCloseTo(signedArea(block.outer) - signedArea(block.interior), 6);
    expect(sum(union(regions))).toBeCloseTo(sum(regions), 6);
    expect(intersection(regions, [block.interior])).toEqual([]);
    const roadway = cover.filter(region => region.surface === 'roadway').map(region => region.polygon);
    expect(difference([native.footprint], roadway)).toEqual([]);
    expect(intersection([native.footprint], cover.filter(region => region.surface === 'sidewalk')
      .map(region => region.polygon))).toEqual([]);
    expect(ModuleGround.cover(construction)).toEqual(cover);

    const middle = construction.definitions.find(definition => definition.id === 'straight:6:middle')!.parts
      .filter(part => part.role === 'panel' && span(part.polygon, 0) > 1);
    expect(middle).toHaveLength(1);
    expect(bounds(middle[0].polygon)).toEqual({ min: [0.006, 2.006], max: [1.994, 3.994] });
    const rails = construction.placements.filter(placement => placement.moduleId === 'guardrail:2');
    expect(rails.map(rail => [rail.turn, rail.count])).toEqual([[3, 2]]);
    for (const part of construction.definitions.find(definition => definition.id === 'guardrail:2')!.parts) {
      expect(part.bottom).toBeGreaterThanOrEqual(0.2);
      expect(bounds(part.polygon).min[1]).toBeGreaterThan(0);
      expect(bounds(part.polygon).max[1]).toBeLessThan(1);
    }
    const authored = native.footprint[0][0];
    native.footprint[0][0] += 1;
    const owned = kit.construction().parking![0];
    if (owned.profile !== 'native') throw new Error('native parking expected');
    expect(owned.footprint[0][0]).toBe(authored);
  });

  it('constructs outer sidewalk rings with fitted terminal groups and stops them at excluded land', () => {
    const kit = new StreetModuleKit();
    const frontage = kit.perimeter({ id: 'fringe', bounds: { min: [10, 20], max: [111, 103] }, width: 4, finish: 'maintained' });
    const construction = kit.construction();
    validPrisms(construction);
    expect(construction.frontages).toEqual([frontage]);
    expect(frontage.planning!.frontages).toHaveLength(4);
    expect(frontage.planning!.corners.every(corner => corner.kind === 'explicit')).toBe(true);
    expect(frontage.planning!.frontages[0].start).toEqual([111, 20]);
    expect(frontage.planning!.frontages[0].end).toEqual([10, 20]);
    expect(frontage.planning!.frontages[0].inward).toEqual([0, -1]);
    const cover = ModuleGround.cover(construction);
    expect(cover.reduce((total, region) => total + signedArea(region.polygon), 0)).toBeCloseTo(110 * 92 - 101 * 83, 7);
    expect(cover.every(region => region.blockId === 'fringe')).toBe(true);
    expect(construction.placements.filter(placement => placement.moduleId.endsWith(':1'))).toHaveLength(4);

    const ring = { min: [10, 20] as Vec2, max: [110, 100] as Vec2 };
    // one bay over the middle of the south side, reaching past the ring's outer edge
    const bay: Polygon = [[50, 10], [70, 10], [70, 22], [50, 22]];
    const cut = new StreetModuleKit();
    const stopped = cut.perimeter({ id: 'fringe', bounds: ring, width: 4, finish: 'maintained', exclusions: [bay] });
    expect(ModuleGround.cover(cut.construction()).every(region => intersection([region.polygon], [bay]).length === 0)).toBe(true);
    const south = stopped.planning!.frontages.filter(front => front.side === 0);
    expect(south.map(front => [front.start, front.end])).toEqual([[[110, 20], [70, 20]], [[50, 20], [10, 20]]]);
    expect(south.map(front => front.cornerIds)).toEqual([['corner:fringe:1', null], [null, 'corner:fringe:0']]);
    expect(stopped.planning!.corners.map(corner => corner.id)).toEqual(['corner:fringe:0', 'corner:fringe:1', 'corner:fringe:2', 'corner:fringe:3']);
    // a corner standing in excluded land goes with the units beside it
    const clipped = new StreetModuleKit().perimeter({ id: 'fringe', bounds: ring, width: 4, finish: 'maintained',
      exclusions: [[[0, 0], [30, 0], [30, 30], [0, 30]]] });
    expect(clipped.planning!.corners.map(corner => corner.id)).toEqual(['corner:fringe:1', 'corner:fringe:2', 'corner:fringe:3']);
    expect(clipped.planning!.frontages.filter(front => front.side === 0).map(front => front.start[0])).toEqual([110]);
  });

  it('publishes whole district blocks, two-metre parking and closed fractional outer rings', () => {
    const request: BlockModuleInput = { id: 'b0', origin: [10, 20], panels: [80, 64], sidewalks: [4, 4, 4, 4],
      finish: 'luxury-blue', centerDouble: true, parking: [{ side: 0, start: 8, slots: 2, profile: 'native' }] };
    const kit = new StreetModuleKit('district');
    const block = kit.block(request), construction = kit.construction();
    validPrisms(construction);
    expect(construction.format).toBe('district');
    expect(block.planning!.frontages.map(front => [front.pavedWidth, front.curbWidth, front.gutterWidth]))
      .toEqual(Array.from({ length: 4 }, () => [4.2, 0.2, 0.5]));
    expect(span(block.interior, 0)).toBeCloseTo(72, 10);
    expect(span(block.outer, 0)).toBeCloseTo(81.8, 10);
    const cover = ModuleGround.cover(construction), regions = cover.map(region => region.polygon);
    expect(sum(regions)).toBeCloseTo(area(block.outer) - area(block.interior), 7);
    expect(sum(union(regions))).toBeCloseTo(sum(regions), 7);
    expect(intersection(regions, [block.interior])).toEqual([]);
    const bay = construction.parking![0];
    if (bay.profile !== 'native') throw new Error('native parking expected');
    expect([bay.width, bay.walkingClearance, bay.slotLength]).toEqual([2, 2.2, 6]);
    expect(bay.slots.map(slot => Number(area(slot).toFixed(10)))).toEqual([12, 12]);
    expect(difference([bay.footprint], cover.filter(region => region.surface === 'roadway').map(region => region.polygon))).toEqual([]);
    const panels = construction.definitions.find(definition => definition.id === 'straight:4:middle:district')!.parts
      .filter(part => part.role === 'panel');
    expect(panels.map(part => [Number(span(part.polygon, 0).toFixed(3)), Number(span(part.polygon, 1).toFixed(3))]))
      .toEqual([[0.988, 0.988], [0.988, 0.988], [0.988, 0.988], [0.988, 0.988], [1.988, 1.988], [1.988, 0.188]]);
    const repeated = new StreetModuleKit('district'); repeated.block(request);
    expect(repeated.construction()).toEqual(construction);

    const outer = new StreetModuleKit('district');
    const limits = { min: [10.1, 20.1] as Vec2, max: [112.3, 99.9] as Vec2 };
    const frontage = outer.perimeter({ id: 'fringe', bounds: limits, width: 4, finish: 'luxury-blue' });
    const outerCover = ModuleGround.cover(outer.construction()).map(region => region.polygon);
    expect(sum(outerCover)).toBeCloseTo(area(frontage.boundary)
      - (limits.max[0] - limits.min[0]) * (limits.max[1] - limits.min[1]), 7);
    expect(sum(union(outerCover))).toBeCloseTo(sum(outerCover), 7);
    expect(difference(outerCover, [frontage.boundary])).toEqual([]);
  });

  it('builds underpass templates as complete physical owners', () => {
    for (const request of [
      { startWidth: 6, endWidth: 2, startReturn: 4, endReturn: 2, span: 14 } as UnderpassInput,
      { format: 'district', startWidth: 4.2, endWidth: 4.2, startReturn: 4.2, endReturn: 4.2, span: 14 } as UnderpassInput,
    ]) {
      const district = request.format === 'district';
      const rim = district ? 0.7 : 0.5;
      const underpass = UnderpassModule.build(request), parts = underpass.definition.parts;
      const length = request.startReturn + request.span + 2 * rim + request.endReturn;
      const narrow = Math.min(request.startWidth, request.endWidth);
      expect(UnderpassModule.build(request)).toEqual(underpass);
      expect(isSimpleRing(underpass.boundary)).toBe(true);
      const box = bounds(underpass.boundary);
      expect(box.min).toEqual([0, -rim]);
      expect(box.max[0]).toBeCloseTo(length, 9);
      expect(box.max[1]).toBeCloseTo(Math.max(request.startWidth, request.endWidth, narrow + rim), 9);
      expect(area(underpass.boundary)).toBeCloseTo((request.startReturn + rim) * (request.startWidth + rim)
        + (request.endReturn + rim) * (request.endWidth + rim) + request.span * (narrow + 2 * rim), 8);
      for (const part of parts) {
        expect(isSimpleRing(part.polygon), `${underpass.definition.id}/${part.role}`).toBe(true);
        expect(area(part.polygon)).toBeGreaterThan(0);
        expect(part.top).toBeGreaterThan(part.bottom);
      }
      const cover = ModuleGround.cover({ version: '1.0.0', format: request.format, definitions: [underpass.definition],
        placements: [{ moduleId: underpass.definition.id, blockId: 'underpass', origin: [0, 0], turn: 0,
          count: 1, step: 0, finish: district ? 'luxury-blue' : 'concrete' }] });
      const beds = cover.map(region => region.polygon);
      expect(difference([underpass.boundary], beds)).toEqual([]);
      expect(difference(beds, [underpass.boundary])).toEqual([]);
      expect(sum(beds)).toBeCloseTo(area(underpass.boundary), 8);
      for (let i = 0; i < beds.length; i++) expect(intersection([beds[i]], beds.slice(i + 1))).toEqual([]);
      const paved = cover.filter(region => region.surface === 'sidewalk').map(region => region.polygon);
      expect(coversPath(union(paved)[0], [[0, narrow / 2], [length, narrow / 2]])).toBe(true);
      for (const [role, surface] of Object.entries({ panel: 'sidewalk', curb: 'curb', gutter: 'gutter', 'gutter-lip': 'gutter' })) {
        const bodies = parts.filter(part => part.role === role);
        expect(bodies.length).toBeGreaterThan(0);
        expect(difference(bodies.map(part => part.polygon),
          cover.filter(region => region.surface === surface).map(region => region.polygon))).toEqual([]);
      }
      // The front curb, gutter bed and lip stand in the first two-metre station, outside the paving.
      const front = (role: ModulePrism['role']) => parts.find(part => {
        const box = bounds(part.polygon);
        return part.role === role && box.min[0] === 0.006 && box.max[0] === 1.994 && box.max[1] <= 0;
      })!;
      const gutterDepth = district ? 0.5 : 0.3;
      const edges = (role: ModulePrism['role']) => [...bounds(front(role).polygon).min, ...bounds(front(role).polygon).max]
        .map(value => Number(value.toFixed(6)));
      const metres = (values: number[]) => values.map(value => Number(value.toFixed(6)));
      expect(edges('curb')).toEqual([0.006, -0.2, 1.994, 0]);
      expect(edges('gutter')).toEqual(metres([0.006, -0.2 - gutterDepth + 0.02, 1.994, -0.2]));
      expect(edges('gutter-lip')).toEqual(metres([0.006, -0.2 - gutterDepth, 1.994, -0.18 - gutterDepth]));
      expect([front('curb').bottom, front('curb').top, front('gutter').top, front('gutter-lip').top])
        .toEqual([0.18, 0.2, 0, 0.02]);
      expect(cover.find(region => region.surface === 'sidewalk')).toMatchObject({ bottom: 0, top: 0.2 });
      expect(cover.find(region => region.surface === 'curb')).toMatchObject({ bottom: -0.03, top: 0.2 });
    }
  });

  it('rejects unsupported formats, dimensions, reservations and parking before publishing geometry', () => {
    const kit = new StreetModuleKit();
    expect(() => kit.block({ ...input, panels: [39, 32] })).toThrow(/whole even panel/);
    expect(() => kit.block({ ...input, origin: [NaN, 0] })).toThrow(/finite coordinates/);
    expect(() => kit.block({ ...input, reserved: [[[8, 6] as Vec2], [], [], []] })).toThrow(/finite coordinates/);
    expect(() => kit.block({ ...input, guardrails: [{ side: 0, start: 6, segments: 4 as 3 }] })).toThrow(/finite coordinates/);
    expect(() => kit.block({ ...input, guardrails: [{ side: 0, start: 28, segments: 1 }] })).toThrow(/finite coordinates/);
    expect(() => kit.perimeter({ id: 'bad', bounds: { min: [0, 0], max: [10.5, 20] }, width: 4, finish: 'maintained' })).toThrow(/whole metre/);
    expect(kit.construction()).toEqual({ version: '1.0.0', definitions: [], placements: [] });

    const wide: BlockModuleInput = { ...input, panels: [80, 64], sidewalks: [6, 6, 6, 6],
      parking: [{ side: 1, start: 8, slots: 2, profile: 'native' }] };
    for (const invalid of [
      { ...input, parking: [{ side: 0 as const, start: 6, slots: 1 as const }] },
      { ...wide, sidewalks: [6, 4, 6, 6] as BlockModuleInput['sidewalks'] },
      { ...wide, parking: [{ side: 1 as const, start: 6, slots: 2 as const, profile: 'native' as const }] },
      { ...wide, parking: [{ side: 1 as const, start: 28, slots: 3 as const, profile: 'native' as const }] },
      { ...wide, reserved: [[], [[6, 7]], [], []] as BlockModuleInput['reserved'] },
    ]) expect(() => new StreetModuleKit().block(invalid)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));

    expect(() => new StreetModuleKit('unknown' as ModuleFormat)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    const district = new StreetModuleKit('district');
    const districtBlock: BlockModuleInput = { id: 'b0', origin: [10, 20], panels: [80, 64], sidewalks: [4, 4, 4, 4],
      finish: 'luxury-blue', parking: [{ side: 0, start: 8, slots: 2, profile: 'native' }] };
    expect(() => district.block({ ...districtBlock, sidewalks: [6, 4, 4, 4] })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    expect(() => district.block({ ...districtBlock, parking: [{ side: 0, start: 8, slots: 2 }] })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    for (const max of [[10.001, 20], [10.2001, 20]] as Vec2[]) {
      expect(() => district.perimeter({ id: 'fringe', bounds: { min: [0, 0], max }, width: 4, finish: 'luxury-blue' }))
        .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    }
    expect(district.construction().placements).toEqual([]);

    const underpass: UnderpassInput = { startWidth: 2, endWidth: 4, startReturn: 6, endReturn: 2, span: 14 };
    expect(() => UnderpassModule.build({ ...underpass, startWidth: 3 as 2 })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    for (const value of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(() => UnderpassModule.build({ ...underpass, span: value })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    }
    const districtUnderpass: UnderpassInput = { format: 'district', startWidth: 4.2, endWidth: 4.2, startReturn: 4.2, endReturn: 4.2, span: 14 };
    expect(() => UnderpassModule.build({ ...districtUnderpass, startWidth: 4 })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    expect(() => UnderpassModule.build({ ...districtUnderpass, span: 14.1 })).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  });
});
