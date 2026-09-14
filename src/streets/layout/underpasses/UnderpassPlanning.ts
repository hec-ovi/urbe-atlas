import type { Vec2 } from '../../../../schema/blueprint';
import type { ModulePlacement, QuarterTurn } from '../../construction/modules/schema';
import type { GridLayoutPlan } from '../schema';
import { invariantFailure } from '../../../errors';
import { placementKey, turnPoint } from './Placement';

interface UnderpassSupport {
  ownerId: string; nodeId: string; gradeEdgeIds: string[]; highwayEdgeIds: string[];
  first: ModulePlacement; last: ModulePlacement; origin: Vec2; turn: QuarterTurn;
  length: number; width: number; startReturn: number; endReturn: number;
}

/** Keeps original owner handoffs when the two corner templates become one underpass. */
export class UnderpassPlanning {
  static replace(plan: GridLayoutPlan, input: UnderpassSupport): void {
    const keys = new Set([input.first, input.last].map(p => placementKey(p.origin, p.turn)));
    const removed = plan.planning.corners.filter(corner => keys.has(placementKey(corner.placement.origin, corner.placement.turn)));
    if (removed.length !== 2) throw invariantFailure('underpass requires its two authored corner supports', { ownerId: input.ownerId });
    const ids = new Set(removed.map(corner => corner.id));
    plan.planning.corners = plan.planning.corners.filter(corner => !ids.has(corner.id));
    for (const frontage of plan.planning.frontages) {
      if (frontage.cornerIds[0] && ids.has(frontage.cornerIds[0])) {
        frontage.start = [...frontage.moduleStationOrigin]; frontage.cornerIds[0] = null;
      }
      if (frontage.cornerIds[1] && ids.has(frontage.cornerIds[1])) {
        if (!frontage.moduleStationEnd) throw invariantFailure('underpass adjoining frontage has no authored end', { frontageId: frontage.id });
        frontage.end = [...frontage.moduleStationEnd]; frontage.cornerIds[1] = null;
      }
    }
    const add = (name: string, from: Vec2, to: Vec2, inward: Vec2, edgeIds: string[]) => {
      const start = turnPoint(from, input.origin, input.turn), end = turnPoint(to, input.origin, input.turn);
      plan.planning.frontages.push({ id: `frontage:${input.ownerId}:${name}`, ownerId: input.ownerId, start, end,
        inward: turnPoint(inward, [0, 0], input.turn), pavedWidth: input.width, edgeIds,
        moduleStationOrigin: [...start], moduleStationEnd: [...end], cornerIds: [null, null] });
    };
    add('grade', [0, -0.5], [input.length, -0.5], [0, 1], input.gradeEdgeIds);
    add('highway', [input.length - input.endReturn - 0.5, input.width + 0.5],
      [input.startReturn + 0.5, input.width + 0.5], [0, -1], input.highwayEdgeIds);
    plan.planning.protected.push({ kind: 'underpass', ownerId: input.ownerId, nodeId: input.nodeId,
      edgeIds: [...input.gradeEdgeIds, ...input.highwayEdgeIds], replacedCornerIds: [...ids] });
  }
}
