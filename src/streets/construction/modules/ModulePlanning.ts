import type { Vec2 } from '../../../../schema/blueprint';
import { arc, DIMENSIONS as D, transform } from './Geometry';
import type { BlockModuleInput, ModuleBlockPlan, ModuleCornerPlan, QuarterTurn } from './schema';

/** Records the same source corners and station frames used by the module kit. */
export class ModulePlanning {
  static block(input: BlockModuleInput): ModuleBlockPlan {
    const [width, depth] = input.panels;
    const origins: Vec2[] = [[0, 0], [width, 0], [width, depth], [0, depth]];
    const cornerId = (side: number) => `corner:${input.id}:${side % 4}`;
    const frontageId = (side: number) => `frontage:${input.id}:${side % 4}`;
    const radius = D.radius + D.curb + D.gutter;
    const corners: ModuleCornerPlan[] = origins.map((local, side) => {
      const turn = side as QuarterTurn, origin = transform(local, input.origin, 0);
      return { id: cornerId(side), ownerId: input.id, frontageIds: [frontageId((side + 3) % 4), frontageId(side)],
        center: transform([D.radius, D.radius], origin, turn), radius,
        arc: arc(radius).map(point => transform(point, origin, turn)),
        placement: { moduleId: `corner:${input.sidewalks[(side + 3) % 4]}:${input.sidewalks[side]}`, origin, turn } };
    });
    return { corners, frontages: origins.map((_, side) => {
      const turn = side as QuarterTurn;
      const start = corners[side].arc.at(-1)!, end = corners[(side + 1) % 4].arc[0];
      const inward = transform([0, 1], [0, 0], turn);
      const station = input.sidewalks[(side + 3) % 4];
      return { id: frontageId(side), ownerId: input.id, side: turn, start: [...start], end: [...end], inward,
        pavedWidth: input.sidewalks[side], moduleStationOrigin: transform([station, -0.5], corners[side].placement.origin, turn),
        cornerIds: [cornerId(side), cornerId(side + 1)] };
    }) };
  }
}
