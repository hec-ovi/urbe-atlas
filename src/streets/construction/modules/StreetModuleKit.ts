import { invalidParams } from '../../../errors';
import { corner } from './Corner';
import { rectangle, transform } from './Geometry';
import type { BlockModuleInput, ModuleBlock, ModuleConstruction, ModuleDefinition, ModuleParking, ModulePlacement, QuarterTurn } from './schema';
import { guardrail, straight } from './Straight';
import { parking } from './Parking';

export class StreetModuleKit {
  private readonly definitions = new Map<string, ModuleDefinition>();
  private readonly placements: ModulePlacement[] = [];
  private readonly blockIds = new Set<string>();
  private readonly parking: ModuleParking[] = [];

  block(input: BlockModuleInput): ModuleBlock {
    this.validate(input);
    const [width, depth] = input.panels;
    const [south, east, north, west] = input.sidewalks;
    const localOrigins = [[west, 0], [width, south], [width - east, depth], [0, depth - north]] as const;
    const cornerOrigins = [[0, 0], [width, 0], [width, depth], [0, depth]] as const;
    const lengths = [width - west - east, depth - south - north];
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
      const straightId = `straight:${sidewalk}:${input.centerDouble ? 'middle' : 'unit'}`;
      const cornerId = `corner:${preceding}:${sidewalk}`;
      const bays = (input.parking ?? []).filter(bay => bay.side === side).sort((a, b) => a.start - b.start);
      const straightDefinition = this.definitions.get(straightId) ?? straight(sidewalk, input.centerDouble ?? false);
      let station = 0;
      for (const bay of bays) {
        use(straightDefinition, transform([station, 0], origin, turn), turn, (bay.start - station) / 2);
        const id = `parking:${sidewalk}:${bay.slots}:${input.centerDouble ? 'middle' : 'unit'}`;
        use(this.definitions.get(id) ?? parking(sidewalk, bay.slots, input.centerDouble ?? false), transform([bay.start, 0], origin, turn), turn);
        station = bay.start + 4 + bay.slots * 4;
        this.parking.push({ blockId: input.id, side: turn, start: bay.start, end: station,
          slotCount: bay.slots, slotLength: 4, width: 2,
          slots: Array.from({ length: bay.slots }, (_, slot) => rectangle(bay.start + 2 + slot * 4, -0.5, 4, 2)
            .map(p => transform(p, origin, turn))),
        });
      }
      use(straightDefinition, transform([station, 0], origin, turn), turn, (length - station) / 2);
      use(this.definitions.get(cornerId) ?? corner(preceding, sidewalk), cornerOrigin, turn);
      if (input.guardrails) {
        for (let station = 6; station + 2 <= length - 6; station += 8) {
          if (input.reserved?.[side].some(([a, b]) => a < station + 2 && b > station)) continue;
          if (bays.some(bay => bay.start < station + 2 && bay.start + 4 + bay.slots * 4 > station)) continue;
          use(this.definitions.get('guardrail:2') ?? guardrail(), transform([station, 0], origin, turn), turn);
        }
      }
    }
    this.blockIds.add(input.id);
    this.placements.push(...placed);
    return {
      id: input.id,
      outer: rectangle(input.origin[0] - 0.5, input.origin[1] - 0.5, width + 1, depth + 1),
      interior: rectangle(input.origin[0] + west, input.origin[1] + south, lengths[0], lengths[1]),
      placements: structuredClone(placed),
    };
  }

  construction(): ModuleConstruction {
    return structuredClone({ version: '1.0.0', definitions: [...this.definitions.values()], placements: this.placements,
      ...(this.parking.length ? { parking: this.parking } : {}),
    });
  }

  private validate(input: BlockModuleInput): void {
    const fail = () => { throw invalidParams('street modules require whole even panel counts, 2/4/6 m sidewalks and finite coordinates', { field: 'streetModules' }); };
    if (!input || typeof input.id !== 'string' || !input.id || this.blockIds.has(input.id)
      || typeof input.finish !== 'string' || !input.finish
      || !Array.isArray(input.origin) || input.origin.length !== 2 || !input.origin.every(Number.isFinite)
      || !Array.isArray(input.panels) || input.panels.length !== 2 || !input.panels.every(n => Number.isSafeInteger(n) && n > 0 && n % 2 === 0)
      || !Array.isArray(input.sidewalks) || input.sidewalks.length !== 4 || !input.sidewalks.every(n => [2, 4, 6].includes(n))
      || (input.centerDouble !== undefined && typeof input.centerDouble !== 'boolean')
      || (input.guardrails !== undefined && typeof input.guardrails !== 'boolean')) fail();
    if (input.panels[0] <= input.sidewalks[1] + input.sidewalks[3]
      || input.panels[1] <= input.sidewalks[0] + input.sidewalks[2]) fail();
    if (input.reserved !== undefined && (!Array.isArray(input.reserved) || input.reserved.length !== 4
      || input.reserved.some(side => !Array.isArray(side) || side.some(span => !Array.isArray(span)
        || span.length !== 2 || !span.every(Number.isFinite) || span[0] < 0 || span[1] <= span[0])))) fail();
    if (input.parking !== undefined) {
      if (!Array.isArray(input.parking)) fail();
      for (const bay of input.parking) {
        if (!bay || ![0, 1, 2, 3].includes(bay.side) || ![1, 2, 3].includes(bay.slots)
          || !Number.isSafeInteger(bay.start) || bay.start < 6 || bay.start % 2 !== 0 || input.sidewalks[bay.side] < 4) fail();
        const side = bay.side;
        const length = input.panels[side % 2] - input.sidewalks[(side + 1) % 4] - input.sidewalks[(side + 3) % 4];
        const end = bay.start + 4 + bay.slots * 4;
        if (end > length - 6 || input.reserved?.[side].some(([a, b]) => a < end && b > bay.start)
          || input.parking.some(other => other !== bay && other.side === side && other.start < end
            && other.start + 4 + other.slots * 4 > bay.start)) fail();
      }
    }
  }
}
