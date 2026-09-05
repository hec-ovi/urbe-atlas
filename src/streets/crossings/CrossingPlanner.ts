import type { StreetEdge } from '../../../schema/blueprint';
import { unsatisfiable } from '../../errors';
import { GRID_STEP } from '../../geom/clip';
import { Approaches, type ApproachCandidate } from './Approaches';
import { isCrossingArm } from './Eligibility';
import { CROSSING_DIMENSIONS } from './Footprints';
import { ContactDomains } from './ContactDomains';
import { validateCrossingPlan } from './Validation';
import { crossingConstruction } from './SourceConstruction';
import type {
  CrossingConstruction, CrossingInput, CrossingJunction, CrossingPlan, CrossingSourceInput, CrossingValidationPlan,
  JunctionApproach, JunctionCrossing, SourceContactPlan,
} from './schema';

export class CrossingPlanner {
  static contacts(input: CrossingSourceInput): SourceContactPlan { return ContactDomains.plan(input); }

  static plan(input: CrossingInput): CrossingPlan {
    const contacts = ContactDomains.plan(input);
    const solver = new Approaches(input);
    const roads = input.edges.filter(isCrossingArm).sort((a, b) => a.id.localeCompare(b.id));
    const candidates = new Map<string, ReturnType<Approaches['ends']>>();
    const external = contacts.domains.flatMap(domain => domain.arms.filter(arm => arm.crossing));
    for (const edge of roads) {
      const from = external.find(arm => arm.edgeId === edge.id && arm.end === 'from');
      const to = external.find(arm => arm.edgeId === edge.id && arm.end === 'to');
      if (!from && !to) continue;
      const ends = solver.ends(edge);
      candidates.set(edge.id, ends);
      if (from && to && (!ends.first || !ends.last
        || ends.last.approach.distance - ends.first.approach.distance < CROSSING_DIMENSIONS.width + GRID_STEP)) {
        throw unsatisfiable('distinct junction approaches lack complete final walking land', {
          edgeId: edge.id, from: from.groupId, to: to.groupId,
        });
      }
    }
    const junctions: CrossingJunction[] = [];
    const crossings: JunctionCrossing[] = [];
    const roadIds = new Set(roads.map(edge => edge.id));
    for (const domain of contacts.domains) {
      if (!domain.groups.some(group => group.junction)) continue;
      const id = `cj${junctions.length}`;
      const groupIds = domain.groups.map(group => group.id);
      const approaches: JunctionApproach[] = [];
      const internalEdgeIds = domain.internalEdgeIds.filter(id => roadIds.has(id));
      const byNode = new Map<string, JunctionCrossing>();
      const add = (edge: StreetEdge, groupId: string, nodeId: string, candidate: ApproachCandidate | null): void => {
        if (!candidate) throw unsatisfiable('junction approach has no complete crossing and pedestrian landings', { groupId, edgeId: edge.id });
        const { field } = candidate.approach;
        const starts = edge.from === nodeId;
        approaches.push({ ...candidate.approach, nodeId, groupId,
          cut: { left: field[starts ? 3 : 2], right: field[starts ? 0 : 1] } });
        const crossing = byNode.get(nodeId) ?? { nodeId, junctionId: id, segments: [] };
        crossing.segments.push(candidate.segment); byNode.set(nodeId, crossing);
      };
      for (const edge of roads) {
        const ends = candidates.get(edge.id);
        for (const arm of domain.arms.filter(arm => arm.crossing && arm.edgeId === edge.id)) {
          add(edge, arm.groupId, arm.nodeId, (arm.end === 'from' ? ends?.first : ends?.last) ?? null);
        }
      }
      // Pedestrian-only contacts have no carriageway marking demand.
      if (!approaches.length && !internalEdgeIds.length) continue;
      if (!approaches.length) throw unsatisfiable('physical junction has no external crossing approach', { groupIds, internalEdgeIds });
      junctions.push({ id, groupIds, nodeIds: [...new Set(domain.groups.map(group => group.nodeId))].sort(), internalEdgeIds, approaches });
      crossings.push(...[...byNode.values()].sort((a, b) => a.nodeId.localeCompare(b.nodeId)));
    }
    const result = { crossings, junctions };
    validateCrossingPlan(input, result, contacts);
    return result;
  }

  static validate(input: CrossingInput, plan: CrossingValidationPlan): void { validateCrossingPlan(input, plan); }

  static construction(edge: StreetEdge, approach: Pick<JunctionApproach, 'distance'>): CrossingConstruction {
    return crossingConstruction(edge, approach);
  }
}
