import type { Vec2 } from '../../../../schema/blueprint';
import type { ModulePlacement, QuarterTurn, SidewalkWidth } from '../../construction/modules/schema';
import { invariantFailure } from '../../../errors';

export function turnPoint([x, z]: Vec2, origin: Vec2, turn: QuarterTurn): Vec2 {
  const point: Vec2 = [[x, z], [-z, x], [-x, -z], [z, -x]][turn] as Vec2;
  return [point[0] + origin[0], point[1] + origin[1]];
}

export const placementKey = (origin: Vec2, turn: QuarterTurn): string => `${origin[0]}:${origin[1]}:${turn}`;

export function cornerDimensions(placement: ModulePlacement): [SidewalkWidth, SidewalkWidth] {
  const [kind, width, depth] = placement.moduleId.split(':');
  const dimensions = [Number(width), Number(depth)];
  if (kind !== 'corner' || dimensions.some(value => ![2, 4, 6].includes(value)) || placement.count !== 1) {
    throw invariantFailure('underpass requires complete corner modules', { moduleId: placement.moduleId });
  }
  return dimensions as [SidewalkWidth, SidewalkWidth];
}
