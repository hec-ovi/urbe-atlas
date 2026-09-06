import { invalidParams } from '../../../errors';
import { corner } from './Corner';
import { rectangle, transform } from './Geometry';
import type { BlockModuleInput, ModuleBlock, ModuleConstruction, ModuleDefinition, ModulePlacement, QuarterTurn } from './schema';
import { guardrail, straight } from './Straight';

export class StreetModuleKit {
  private readonly definitions = new Map<string, ModuleDefinition>();
  private readonly placements: ModulePlacement[] = [];
  private readonly blockIds = new Set<string>();

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
      use(this.definitions.get(straightId) ?? straight(sidewalk, input.centerDouble ?? false), origin, turn, length / 2);
      use(this.definitions.get(cornerId) ?? corner(preceding, sidewalk), cornerOrigin, turn);
      if (input.guardrails) {
        for (let station = 6; station + 2 <= length - 6; station += 8) {
          if (input.reserved?.[side].some(([a, b]) => a < station + 2 && b > station)) continue;
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
    return structuredClone({ version: '1.0.0', definitions: [...this.definitions.values()], placements: this.placements });
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
  }
}
