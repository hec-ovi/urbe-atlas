import { invalidParams } from '../../../errors';
import { corner } from './Corner';
import { rectangle, transform } from './Geometry';
import type { BlockModuleInput, ModuleBlock, ModuleConstruction, ModuleDefinition, ModuleFormat, ModuleFrontage, ModuleParking, ModulePlacement, PerimeterModuleInput, QuarterTurn } from './schema';
import { guardrail, straight } from './Straight';
import { parking, parkingSupport } from './Parking';
import { NativeParking } from './NativeParking';
import { ModulePlanning } from './ModulePlanning';
import { perimeterCorner } from './Perimeter';
import { measure, moduleId, moduleSizing, onGrid, type ModuleSizing } from './Format';

export class StreetModuleKit {
  private readonly definitions = new Map<string, ModuleDefinition>();
  private readonly placements: ModulePlacement[] = [];
  private readonly blockIds = new Set<string>();
  private readonly parking: ModuleParking[] = [];
  private readonly frontages: ModuleFrontage[] = [];
  private readonly sizing: Readonly<ModuleSizing>;

  constructor(format: ModuleFormat = 'source') { this.sizing = moduleSizing(format); }

  perimeter(input: PerimeterModuleInput): ModuleFrontage {
    const sizing = this.sizing, rim = measure(sizing.curb + sizing.gutter);
    const spans = [input.bounds.max[0] - input.bounds.min[0], input.bounds.max[1] - input.bounds.min[1]];
    if (!input.id || this.blockIds.has(input.id) || !input.finish || ![2, 4, 6].includes(input.width)
      || (sizing.format === 'district' && input.width !== 4)
      || ![...input.bounds.min, ...input.bounds.max].every(value => sizing.format === 'district' ? onGrid(value, 0.001) : Number.isFinite(value))
      || !spans.every(value => value >= 4 && (sizing.format === 'district' ? onGrid(value, 0.2) : Number.isSafeInteger(value)))) {
      throw invalidParams(sizing.format === 'district'
        ? 'district perimeter requires 0.2 m roadway spans, millimetre-grid bounds and 4 m panels'
        : 'perimeter requires whole metre roadway spans and 2/4/6 m sidewalks');
    }
    if (sizing.format === 'district') input = { ...input, bounds: {
      min: input.bounds.min.map(measure) as [number, number], max: input.bounds.max.map(measure) as [number, number],
    } };
    const { min, max } = input.bounds;
    const [width, depth] = sizing.format === 'district' ? spans.map(measure) : spans;
    const add = (definition: ModuleDefinition, origin: [number, number], turn: QuarterTurn, count = 1) => {
      if (!this.definitions.has(definition.id)) this.definitions.set(definition.id, definition);
      this.placements.push({ moduleId: definition.id, blockId: input.id, origin, turn, count, step: 2, finish: input.finish });
    };
    const origins: [number, number][] = [[max[0], min[1] - rim], [max[0] + rim, max[1]],
      [min[0], max[1] + rim], [min[0] - rim, min[1]]];
    const corners: [number, number][] = [[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]];
    const straightDefinition = straight(input.width, true, 2, sizing);
    const cornerDefinition = perimeterCorner(input.width, sizing);
    for (let side = 0; side < 4; side++) {
      const length = side % 2 ? depth : width;
      const turn = ((side + 2) % 4) as QuarterTurn;
      add(straightDefinition, origins[side], turn, Math.floor(length / 2));
      const remainder = measure(length % 2);
      if (remainder) add(straight(input.width, false, remainder, sizing), transform([length - remainder, 0], origins[side], turn), turn);
      add(cornerDefinition, corners[side], side as QuarterTurn);
    }
    const margin = measure(input.width + sizing.separator + rim);
    const out = { id: input.id, planning: ModulePlanning.perimeter(input, sizing), boundary: rectangle(min[0] - margin, min[1] - margin,
      width + margin * 2, depth + margin * 2) };
    this.blockIds.add(input.id);
    this.frontages.push(out);
    return structuredClone(out);
  }

  block(input: BlockModuleInput): ModuleBlock {
    this.validate(input);
    const sizing = this.sizing, rim = measure(sizing.curb + sizing.gutter);
    const [width, depth] = input.panels.map(value => measure(value + sizing.separator * 2));
    const [south, east, north, west] = input.sidewalks.map(value => measure(value + sizing.separator));
    const localOrigins = [[west, 0], [width, south], [width - east, depth], [0, depth - north]] as const;
    const cornerOrigins = [[0, 0], [width, 0], [width, depth], [0, depth]] as const;
    const lengths = [measure(width - west - east), measure(depth - south - north)];
    const placed: ModulePlacement[] = [];
    const use = (definition: ModuleDefinition, origin: [number, number], turn: QuarterTurn, count = 1, step = 2) => {
      if (count === 0) return;
      if (!this.definitions.has(definition.id)) this.definitions.set(definition.id, definition);
      placed.push({ moduleId: definition.id, blockId: input.id, origin, turn, count, step, finish: input.finish });
    };
    for (let side = 0; side < 4; side++) {
      const turn = side as QuarterTurn;
      const origin = transform([...localOrigins[side]], input.origin, 0);
      const cornerOrigin = transform([...cornerOrigins[side]], input.origin, 0);
      const length = lengths[side % 2];
      const sidewalk = input.sidewalks[side];
      const preceding = input.sidewalks[(side + 3) % 4];
      const straightId = moduleId(`straight:${sidewalk}:${input.centerDouble ? 'middle' : 'unit'}`, sizing);
      const cornerId = moduleId(`corner:${preceding}:${sidewalk}`, sizing);
      const bays = (input.parking ?? []).filter(bay => bay.side === side).sort((a, b) => a.start - b.start);
      const straightDefinition = this.definitions.get(straightId) ?? straight(sidewalk, input.centerDouble ?? false, 2, sizing);
      let station = 0;
      for (const bay of bays) {
        const native = bay.profile === 'native';
        const support = parkingSupport(bay);
        const supportStart = support.start;
        use(straightDefinition, transform([station, 0], origin, turn), turn, (supportStart - station) / 2);
        const id = native ? moduleId(`parking-native:${sidewalk}:${bay.slots}`, sizing) : `parking:${sidewalk}:${bay.slots}:${input.centerDouble ? 'middle' : 'unit'}`;
        const definition = this.definitions.get(id) ?? (native ? NativeParking.build(bay.slots, sizing, sidewalk)
          : parking(sidewalk, bay.slots, input.centerDouble ?? false));
        use(definition, transform([supportStart, 0], origin, turn), turn);
        const end = bay.start + (native ? NativeParking.length(bay.slots) : 4 + bay.slots * 4);
        station = support.end;
        const identity = { blockId: input.id, side: turn, start: bay.start, end, slotCount: bay.slots };
        this.parking.push(native ? { ...identity, profile: 'native', frontageId: ModulePlanning.frontageId(input.id, side), slotLength: 6, width: sizing.parkingDepth, endRun: 2,
          footprint: NativeParking.footprint(bay.slots, sizing).map(([x, z]) => transform([x + bay.start, z], origin, turn)),
          support, walkingClearance: measure(sidewalk + sizing.separator - sizing.parkingDepth),
          slots: Array.from({ length: bay.slots }, (_, slot) => rectangle(bay.start + 2 + slot * 6, -rim, 6, sizing.parkingDepth)
            .map(p => transform(p, origin, turn))),
        } : { ...identity, slotLength: 4, width: 2,
          slots: Array.from({ length: bay.slots }, (_, slot) => rectangle(bay.start + 2 + slot * 4, -0.5, 4, 2)
            .map(p => transform(p, origin, turn))),
        });
      }
      use(straightDefinition, transform([station, 0], origin, turn), turn, (length - station) / 2);
      use(this.definitions.get(cornerId) ?? corner(preceding, sidewalk, sizing), cornerOrigin, turn);
      for (const rail of input.guardrails ?? []) {
        if (rail.side !== side) continue;
        const end = rail.start + rail.segments * 2;
        if (input.reserved?.[side].some(([a, b]) => a < end && b > rail.start)) continue;
        if (bays.some(bay => { const span = parkingSupport(bay); return span.start < end && span.end > rail.start; })) continue;
        use(this.definitions.get('guardrail:2') ?? guardrail(), transform([rail.start, 0], origin, turn), turn, rail.segments);
      }
    }
    this.blockIds.add(input.id);
    this.placements.push(...placed);
    return {
      id: input.id,
      outer: rectangle(input.origin[0] - rim, input.origin[1] - rim, measure(width + rim * 2), measure(depth + rim * 2)),
      interior: rectangle(input.origin[0] + west, input.origin[1] + south, lengths[0], lengths[1]),
      placements: structuredClone(placed), planning: ModulePlanning.block(input, sizing),
    };
  }

  construction(): ModuleConstruction {
    return structuredClone({ version: '1.0.0', definitions: [...this.definitions.values()], placements: this.placements,
      ...(this.sizing.format === 'district' ? { format: 'district' as const } : {}),
      ...(this.parking.length ? { parking: this.parking } : {}),
      ...(this.frontages.length ? { frontages: this.frontages } : {}),
    });
  }

  private validate(input: BlockModuleInput): void {
    const fail = () => { throw invalidParams('street modules require whole even panel counts, 2/4/6 m sidewalks and finite coordinates', { field: 'streetModules' }); };
    if (!input || typeof input.id !== 'string' || !input.id || this.blockIds.has(input.id)
      || typeof input.finish !== 'string' || !input.finish
      || !Array.isArray(input.origin) || input.origin.length !== 2 || !input.origin.every(Number.isFinite)
      || !Array.isArray(input.panels) || input.panels.length !== 2 || !input.panels.every(n => Number.isSafeInteger(n) && n > 0 && n % 2 === 0)
      || !Array.isArray(input.sidewalks) || input.sidewalks.length !== 4 || !input.sidewalks.every(n => [2, 4, 6].includes(n))
      || (input.centerDouble !== undefined && typeof input.centerDouble !== 'boolean')) fail();
    if (this.sizing.format === 'district' && input.sidewalks.some(width => width !== 4)) fail();
    if (input.panels[0] <= input.sidewalks[1] + input.sidewalks[3]
      || input.panels[1] <= input.sidewalks[0] + input.sidewalks[2]) fail();
    if (input.reserved !== undefined && (!Array.isArray(input.reserved) || input.reserved.length !== 4
      || input.reserved.some(side => !Array.isArray(side) || side.some(span => !Array.isArray(span)
        || span.length !== 2 || !span.every(Number.isFinite) || span[0] < 0 || span[1] <= span[0])))) fail();
    if (input.guardrails !== undefined) {
      if (!Array.isArray(input.guardrails)) fail();
      for (const rail of input.guardrails) {
        if (!rail || ![0, 1, 2, 3].includes(rail.side) || ![1, 2, 3].includes(rail.segments)
          || !Number.isSafeInteger(rail.start) || rail.start < 6 || rail.start % 2 !== 0) fail();
        const length = input.panels[rail.side % 2] - input.sidewalks[(rail.side + 1) % 4] - input.sidewalks[(rail.side + 3) % 4];
        if (rail.start + rail.segments * 2 > length - 6) fail();
      }
    }
    if (input.parking !== undefined) {
      if (!Array.isArray(input.parking)) fail();
      for (const bay of input.parking) {
        if (!bay || ![0, 1, 2, 3].includes(bay.side) || ![1, 2, 3].includes(bay.slots)
          || !Number.isSafeInteger(bay.start) || bay.start < (bay.profile ? 8 : 6) || bay.start % 2 !== 0
          || (bay.profile !== undefined && bay.profile !== 'native')
          || (this.sizing.format === 'district' && bay.profile !== 'native')
          || (bay.profile === 'native' ? input.sidewalks[bay.side] !== (this.sizing.format === 'district' ? 4 : 6) : input.sidewalks[bay.side] < 4)) fail();
        const side = bay.side;
        const length = input.panels[side % 2] - input.sidewalks[(side + 1) % 4] - input.sidewalks[(side + 3) % 4];
        const { start, end } = parkingSupport(bay);
        if (end > length - 6 || input.reserved?.[side].some(([a, b]) => a < end && b > start)
          || input.parking.some(other => {
            const span = parkingSupport(other);
            return other !== bay && other.side === side && span.start < end && span.end > start;
          })) fail();
      }
    }
  }
}
