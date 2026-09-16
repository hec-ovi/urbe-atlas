import type { Vec2 } from '../../../../schema/blueprint';
import type { ModuleFormat, ModulePlacement, QuarterTurn } from '../../construction/modules/schema';
import type { LayoutPlanningData } from '../schema';
import { invariantFailure } from '../../../errors';

export function turnPoint([x, z]: Vec2, origin: Vec2, turn: QuarterTurn): Vec2 {
  const point: Vec2 = [[x, z], [-z, x], [-x, -z], [z, -x]][turn] as Vec2;
  return [point[0] + origin[0], point[1] + origin[1]];
}

export const placementKey = (origin: Vec2, turn: QuarterTurn): string => `${Math.round(origin[0] * 1000)}:${Math.round(origin[1] * 1000)}:${turn}`;

/** Physical dimensions come from the two authored frontage frames at this corner. */
export function cornerDimensions(placement: ModulePlacement, planning: LayoutPlanningData, format: ModuleFormat = 'source'): [number, number] {
  const corner = planning.corners.find(corner => corner.ownerId === placement.blockId
    && corner.placement.moduleId === placement.moduleId
    && placementKey(corner.placement.origin, corner.placement.turn) === placementKey(placement.origin, placement.turn));
  if (!corner || corner.kind !== 'arc' || placement.count !== 1) {
    throw invariantFailure('underpass requires complete authored corner supports', { moduleId: placement.moduleId, blockId: placement.blockId });
  }
  const fronts = corner.frontageIds.map(id => planning.frontages.find(frontage => frontage.id === id));
  const axes: Vec2[] = [[1, 0], [0, 1]], widths = format === 'district' ? [4.2] : [2, 4, 6];
  const dimensions = axes.map(axis => {
    const inward = turnPoint(axis, [0, 0], placement.turn);
    return fronts.find(frontage => frontage?.inward.every((value, index) => value === inward[index]))?.pavedWidth;
  });
  if (dimensions.some(value => value === undefined || !widths.includes(value))
    || fronts.some(frontage => !frontage || (frontage.curbWidth ?? 0.2) !== 0.2
      || (frontage.gutterWidth ?? 0.3) !== (format === 'district' ? 0.5 : 0.3))) {
    throw invariantFailure('underpass corner dimensions differ from the construction format', { cornerId: corner.id, format });
  }
  return dimensions as [number, number];
}
