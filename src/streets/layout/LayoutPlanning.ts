import type { Vec2 } from '../../../schema/blueprint';
import type { ModuleBlockPlan } from '../construction/modules/schema';
import type { DiagonalBlockTemplate } from '../construction/modules/diagonal/schema';
import type { GridLayoutPlan, LayoutPlanningData } from './schema';

/** Carries producer-owned supports through graph edits, without constructing another layout. */
export class LayoutPlanning {
  static add(target: LayoutPlanningData, source: ModuleBlockPlan, edgeIds: string[][]): void {
    target.corners.push(...source.corners);
    target.frontages.push(...source.frontages.map(({ side, ...frontage }) => ({ ...frontage, edgeIds: [...edgeIds[side]] })));
  }

  static diagonal(plan: GridLayoutPlan, ownerId: string, template: DiagonalBlockTemplate, origin: Vec2, edgeId: string): void {
    const previous = plan.planning.frontages.filter(frontage => frontage.ownerId === ownerId);
    plan.planning.frontages = plan.planning.frontages.filter(frontage => frontage.ownerId !== ownerId);
    plan.planning.corners = plan.planning.corners.filter(corner => corner.ownerId !== ownerId);
    const place = ([x, z]: Vec2): Vec2 => [x + origin[0], z + origin[1]];
    for (const [contour, source] of template.planning.entries()) {
      const frontageId = (side: number) => `frontage:${ownerId}:diagonal:${contour}:${side}`;
      const cornerId = (side: number) => `corner:${ownerId}:diagonal:${contour}:${side}`;
      source.frontages.forEach((frontage, side) => {
        const matching = previous.find(value => value.inward.every((n, axis) => Math.abs(n - frontage.inward[axis]) < 1e-10));
        plan.planning.frontages.push({ ...frontage, id: frontageId(side), ownerId,
          start: place(frontage.start), end: place(frontage.end), moduleStationOrigin: place(frontage.start),
          cornerIds: [cornerId(side), cornerId((side + 1) % source.corners.length)],
          edgeIds: matching ? [...matching.edgeIds] : [edgeId] });
      });
      source.corners.forEach((corner, side) => {
        plan.planning.corners.push({ ...corner, kind: 'arc', id: cornerId(side), ownerId,
          center: place(corner.center), arc: corner.arc.map(place),
          frontageIds: [frontageId((side + source.frontages.length - 1) % source.frontages.length), frontageId(side)],
          placement: { moduleId: template.definition.id, origin: [...origin], turn: 0 } });
      });
    }
  }
}
