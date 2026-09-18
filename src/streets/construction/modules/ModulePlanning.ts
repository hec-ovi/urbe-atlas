import type { Vec2 } from '../../../../schema/blueprint';
import { rectangle, transform } from './Geometry';
import type { BlockModuleInput, ModuleBlockPlan, ModuleCornerPlan, ModuleFrontagePlan, PerimeterModuleInput, QuarterTurn } from './schema';
import { perimeterSections, type PerimeterSide } from './Perimeter';
import { measure, moduleId, moduleSizing } from './Format';

/** Records the same source corners and station frames used by the module kit. */
export class ModulePlanning {
  static frontageId(ownerId: string, side: number): string { return `frontage:${ownerId}:${side}`; }

  static perimeter(input: PerimeterModuleInput, sizing = moduleSizing(), sections = perimeterSections(input, sizing)): ModuleBlockPlan {
    const width = measure(input.width + sizing.separator), rim = measure(sizing.curb + sizing.gutter);
    const cornerId = (side: number) => `corner:${input.id}:${side % 4}`;
    // A side cut by water carries one frontage per dry stretch; an uncut side keeps its single original id.
    const frontageId = (side: PerimeterSide, run: number) =>
      side.runs.length > 1 ? `${this.frontageId(input.id, side.side)}:${run}` : this.frontageId(input.id, side.side);
    const at = (side: PerimeterSide, station: number): Vec2 => station === 0 ? [...side.start]
      : station === side.length ? [...side.end]
        : [measure(side.start[0] + Math.sign(side.end[0] - side.start[0]) * station),
          measure(side.start[1] + Math.sign(side.end[1] - side.start[1]) * station)];
    return {
      frontages: sections.sides.flatMap(side => side.runs.map((run, index): ModuleFrontagePlan => {
        const start = at(side, run.start), end = at(side, run.end);
        return { id: frontageId(side, index), ownerId: input.id, side: side.side, start, end,
          inward: transform([0, 1], [0, 0], side.turn), pavedWidth: width,
          ...(sizing.format === 'district' ? { curbWidth: sizing.curb, gutterWidth: sizing.gutter } : {}),
          moduleStationOrigin: [...start], moduleStationEnd: [...end],
          cornerIds: [run.start === 0 && sections.corners[(side.side + 1) % 4].placed ? cornerId(side.side + 1) : null,
            run.end === side.length && sections.corners[side.side].placed ? cornerId(side.side) : null] };
      })),
      corners: sections.corners.flatMap(({ origin, placed }, side): ModuleCornerPlan[] => {
        if (!placed) return [];
        const ending = sections.sides[side], starting = sections.sides[(side + 3) % 4];
        return [{ kind: 'explicit', id: cornerId(side), ownerId: input.id,
          frontageIds: [frontageId(ending, ending.runs.length - 1), frontageId(starting, 0)],
          boundary: rectangle(-width - rim, -width - rim, width + rim, width + rim)
            .map(point => transform(point, origin, side as QuarterTurn)),
          placement: { moduleId: moduleId(`perimeter-corner:${input.width}`, sizing), origin: [...origin], turn: side as QuarterTurn },
        }];
      }),
    };
  }

  static block(input: BlockModuleInput, sizing = moduleSizing()): ModuleBlockPlan {
    const [width, depth] = input.panels.map(value => measure(value + sizing.separator * 2));
    const origins: Vec2[] = [[0, 0], [width, 0], [width, depth], [0, depth]];
    const cornerId = (side: number) => `corner:${input.id}:${side % 4}`;
    const frontageId = (side: number) => this.frontageId(input.id, side % 4);
    const rim = measure(sizing.curb + sizing.gutter);
    // Corner s is the square where run s-1 meets run s: its own paving plus the rim around it.
    const size = (side: number) => ({ width: measure(input.sidewalks[(side + 3) % 4] + sizing.separator),
      depth: measure(input.sidewalks[side % 4] + sizing.separator) });
    const corners = origins.map((local, side): ModuleCornerPlan => {
      const turn = side as QuarterTurn, origin = transform(local, input.origin, 0), box = size(side);
      return { kind: 'explicit', id: cornerId(side), ownerId: input.id,
        frontageIds: [frontageId((side + 3) % 4), frontageId(side)],
        boundary: rectangle(-rim, -rim, measure(box.width + rim), measure(box.depth + rim))
          .map(point => transform(point, origin, turn)),
        placement: { moduleId: moduleId(`corner:${input.sidewalks[(side + 3) % 4]}:${input.sidewalks[side]}`, sizing), origin, turn } };
    });
    return { corners, frontages: origins.map((_, side): ModuleFrontagePlan => {
      const turn = side as QuarterTurn, origin = corners[side].placement.origin;
      const start = transform([size(side).width, -rim], origin, turn);
      const end = transform([measure(input.panels[side % 2] - input.sidewalks[(side + 1) % 4] + sizing.separator), -rim], origin, turn);
      return { id: frontageId(side), ownerId: input.id, side: turn, start, end,
        inward: transform([0, 1], [0, 0], turn),
        pavedWidth: measure(input.sidewalks[side] + sizing.separator),
        ...(sizing.format === 'district' ? { curbWidth: sizing.curb, gutterWidth: sizing.gutter } : {}),
        moduleStationOrigin: [...start], moduleStationEnd: [...end],
        cornerIds: [cornerId(side), cornerId(side + 1)] };
    }) };
  }
}
