import type { Vec2 } from '../../../../schema/blueprint';
import { arc, DIMENSIONS as D, rectangle, transform } from './Geometry';
import type { BlockModuleInput, ModuleBlockPlan, ModuleCornerPlan, PerimeterModuleInput, QuarterTurn } from './schema';

/** Records the same source corners and station frames used by the module kit. */
export class ModulePlanning {
  static frontageId(ownerId: string, side: number): string { return `frontage:${ownerId}:${side}`; }

  static perimeter(input: PerimeterModuleInput): ModuleBlockPlan {
    const { min, max } = input.bounds;
    const corners: Vec2[] = [[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]];
    const cornerId = (side: number) => `corner:${input.id}:${side % 4}`;
    const frontageId = (side: number) => this.frontageId(input.id, side % 4);
    const fronts: [Vec2, Vec2][] = [[corners[1], corners[0]], [corners[2], corners[1]], [corners[3], corners[2]], [corners[0], corners[3]]];
    return {
      frontages: fronts.map(([start, end], side) => {
        const turn = ((side + 2) % 4) as QuarterTurn;
        return { id: frontageId(side), ownerId: input.id, side: side as QuarterTurn, start: [...start], end: [...end],
          inward: transform([0, 1], [0, 0], turn), pavedWidth: input.width, moduleStationOrigin: [...start], moduleStationEnd: [...end],
          cornerIds: [cornerId(side + 1), cornerId(side)] };
      }),
      corners: corners.map((origin, side): ModuleCornerPlan => ({ kind: 'explicit', id: cornerId(side), ownerId: input.id,
        frontageIds: [frontageId(side), frontageId((side + 3) % 4)],
        boundary: rectangle(-input.width - 0.5, -input.width - 0.5, input.width + 0.5, input.width + 0.5)
          .map(point => transform(point, origin, side as QuarterTurn)),
        placement: { moduleId: `perimeter-corner:${input.width}`, origin: [...origin], turn: side as QuarterTurn },
      })),
    };
  }

  static block(input: BlockModuleInput): ModuleBlockPlan {
    const [width, depth] = input.panels;
    const origins: Vec2[] = [[0, 0], [width, 0], [width, depth], [0, depth]];
    const cornerId = (side: number) => `corner:${input.id}:${side % 4}`;
    const frontageId = (side: number) => this.frontageId(input.id, side % 4);
    const radius = D.radius + D.curb + D.gutter;
    const corners = origins.map((local, side) => {
      const turn = side as QuarterTurn, origin = transform(local, input.origin, 0);
      return { kind: 'arc' as const, id: cornerId(side), ownerId: input.id, frontageIds: [frontageId((side + 3) % 4), frontageId(side)] as [string, string],
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
        moduleStationEnd: transform([input.panels[side % 2] - input.sidewalks[(side + 1) % 4], -0.5], corners[side].placement.origin, turn),
        cornerIds: [cornerId(side), cornerId(side + 1)] };
    }) };
  }
}
