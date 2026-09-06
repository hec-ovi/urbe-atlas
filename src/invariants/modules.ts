import type { CityBlueprint, Vec2 } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { ModuleGround } from '../streets/construction/modules/ModuleGround';
import { area, bounds, isSimpleRing } from '../geom/polygon';

/** Validates shared geometry and its compact saved planning covers. */
export function checkModules(bp: CityBlueprint): void {
  const construction = bp.streets.construction!.modules!;
  const definitions = new Map(construction.definitions.map(definition => [definition.id, definition]));
  const blocks = new Map(bp.blocks.map(block => [block.id, bounds(block.boundary)]));
  for (const frontage of construction.frontages ?? []) {
    if (blocks.has(frontage.id) || !isSimpleRing(frontage.boundary)) throw invariantFailure('invalid street frontage owner');
    blocks.set(frontage.id, bounds(frontage.boundary));
  }
  if (construction.version !== '1.0.0' || definitions.size !== construction.definitions.length) {
    throw invariantFailure('invalid street module catalog');
  }
  for (const definition of definitions.values()) for (const part of definition.parts) {
    if (![part.bottom, part.top, ...part.polygon.flat()].every(Number.isFinite)
      || part.bottom >= part.top || !isSimpleRing(part.polygon) || area(part.polygon) <= 0) {
      throw invariantFailure('invalid street module prism', { moduleId: definition.id });
    }
  }
  const boxes = new Map([...definitions].map(([id, definition]) => [id, bounds(definition.parts.flatMap(part => part.polygon))]));
  for (const placement of construction.placements) {
    const block = blocks.get(placement.blockId), box = boxes.get(placement.moduleId);
    if (!block || !box || ![0, 1, 2, 3].includes(placement.turn)
      || !Number.isSafeInteger(placement.count) || placement.count < 1 || placement.step !== 2
      || !placement.origin.every(Number.isFinite)) throw invariantFailure('invalid street module placement');
    const corners: Vec2[] = [[box.min[0], box.min[1]], [box.max[0] + (placement.count - 1) * placement.step, box.min[1]],
      [box.max[0] + (placement.count - 1) * placement.step, box.max[1]], [box.min[0], box.max[1]]];
    for (const [x, z] of corners) {
      const turn: Vec2 = [[x, z], [-z, x], [-x, -z], [z, -x]][placement.turn] as Vec2;
      const point: Vec2 = [turn[0] + placement.origin[0], turn[1] + placement.origin[1]];
      if (point.some((value, axis) => value < block.min[axis] - 0.001 || value > block.max[axis] + 0.001)) {
        throw invariantFailure('street module exceeds its block', { blockId: placement.blockId, moduleId: placement.moduleId });
      }
    }
  }
  const expected = ModuleGround.cover(construction).map(({ blockId, ...region }) => ({ ...region, moduleBlockId: blockId }));
  const actual = bp.volumetric.ground.filter(region => region.moduleBlockId !== undefined);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw invariantFailure('street module planning cover does not match its pieces');
}
