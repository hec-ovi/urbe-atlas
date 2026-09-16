import type { Vec2 } from '../../../../schema/blueprint';
import { arc, CORNER_ANGLES, DIMENSIONS as D, rectangle, transform } from './Geometry';
import type { BlockModuleInput, ModuleBlockPlan, ModuleCornerPlan, PerimeterModuleInput, QuarterTurn } from './schema';
import { measure, moduleId, moduleSizing } from './Format';

/** Records the same source corners and station frames used by the module kit. */
export class ModulePlanning {
  static frontageId(ownerId: string, side: number): string { return `frontage:${ownerId}:${side}`; }

  static perimeter(input: PerimeterModuleInput, sizing = moduleSizing()): ModuleBlockPlan {
    const width = measure(input.width + sizing.separator), rim = measure(sizing.curb + sizing.gutter);
    const { min, max } = input.bounds;
    const corners: Vec2[] = [[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]];
    const cornerId = (side: number) => `corner:${input.id}:${side % 4}`;
    const frontageId = (side: number) => this.frontageId(input.id, side % 4);
    const fronts: [Vec2, Vec2][] = [[corners[1], corners[0]], [corners[2], corners[1]], [corners[3], corners[2]], [corners[0], corners[3]]];
    return {
      frontages: fronts.map(([start, end], side) => {
        const turn = ((side + 2) % 4) as QuarterTurn;
        return { id: frontageId(side), ownerId: input.id, side: side as QuarterTurn, start: [...start], end: [...end],
          inward: transform([0, 1], [0, 0], turn), pavedWidth: width,
          ...(sizing.format === 'district' ? { curbWidth: sizing.curb, gutterWidth: sizing.gutter } : {}), moduleStationOrigin: [...start], moduleStationEnd: [...end],
          cornerIds: [cornerId(side + 1), cornerId(side)] };
      }),
      corners: corners.map((origin, side): ModuleCornerPlan => ({ kind: 'explicit', id: cornerId(side), ownerId: input.id,
        frontageIds: [frontageId(side), frontageId((side + 3) % 4)],
        boundary: rectangle(-width - rim, -width - rim, width + rim, width + rim)
          .map(point => transform(point, origin, side as QuarterTurn)),
        placement: { moduleId: moduleId(`perimeter-corner:${input.width}`, sizing), origin: [...origin], turn: side as QuarterTurn },
      })),
    };
  }

  static block(input: BlockModuleInput, sizing = moduleSizing()): ModuleBlockPlan {
    const [width, depth] = input.panels.map(value => measure(value + sizing.separator * 2));
    const origins: Vec2[] = [[0, 0], [width, 0], [width, depth], [0, depth]];
    const cornerId = (side: number) => `corner:${input.id}:${side % 4}`;
    const frontageId = (side: number) => this.frontageId(input.id, side % 4);
    const rim = measure(sizing.curb + sizing.gutter), pavedRadius = sizing.format === 'district' ? 4.2 : D.radius, radius = measure(pavedRadius + rim);
    const corners = origins.map((local, side) => {
      const turn = side as QuarterTurn, origin = transform(local, input.origin, 0);
      return { kind: 'arc' as const, id: cornerId(side), ownerId: input.id, frontageIds: [frontageId((side + 3) % 4), frontageId(side)] as [string, string],
        center: transform([pavedRadius, pavedRadius], origin, turn), radius,
        arc: arc(radius, CORNER_ANGLES, pavedRadius).map(point => transform(point, origin, turn)),
        placement: { moduleId: moduleId(`corner:${input.sidewalks[(side + 3) % 4]}:${input.sidewalks[side]}`, sizing), origin, turn } };
    });
    return { corners, frontages: origins.map((_, side) => {
      const turn = side as QuarterTurn;
      const start = corners[side].arc.at(-1)!, end = corners[(side + 1) % 4].arc[0];
      const inward = transform([0, 1], [0, 0], turn);
      const station = measure(input.sidewalks[(side + 3) % 4] + sizing.separator);
      return { id: frontageId(side), ownerId: input.id, side: turn, start: [...start], end: [...end], inward,
        pavedWidth: measure(input.sidewalks[side] + sizing.separator),
        ...(sizing.format === 'district' ? { curbWidth: sizing.curb, gutterWidth: sizing.gutter } : {}),
        moduleStationOrigin: transform([station, -rim], corners[side].placement.origin, turn),
        moduleStationEnd: transform([measure(input.panels[side % 2] - input.sidewalks[(side + 1) % 4] + sizing.separator), -rim], corners[side].placement.origin, turn),
        cornerIds: [cornerId(side), cornerId(side + 1)] };
    }) };
  }
}
