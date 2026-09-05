import { isCrossingArm } from './Eligibility';
import { ContactGroups } from './Groups';
import { SourceDomains } from './SourceDomains';
import type { CrossingSourceInput, SourceContactArm, SourceContactPlan } from './schema';
import { Traffic } from './Traffic';

/** Extends real contacts through original edges until their source approaches fit. */
export class ContactDomains {
  static plan(input: CrossingSourceInput): SourceContactPlan {
    const resolved = this.resolve(input);
    const edges = [...input.edges].sort((a, b) => a.id.localeCompare(b.id));
    return { domains: resolved.components().map(component => {
      const groups = component.map(group => ({
        id: group.id, nodeId: group.nodeId, pedestrianEdgeIds: [...group.edgeIds],
        trafficEdgeIds: [...group.trafficEdgeIds], junction: group.junction,
      }));
      const demanded = groups.some(group => group.junction);
      const internalEdgeIds: string[] = [], arms: SourceContactArm[] = [];
      for (const edge of edges) {
        const incident = groups.filter(group => group.pedestrianEdgeIds.includes(edge.id)
          || group.trafficEdgeIds.includes(edge.id));
        const from = incident.find(group => group.nodeId === edge.from);
        const to = incident.find(group => group.nodeId === edge.to);
        if (from && to) { internalEdgeIds.push(edge.id); continue; }
        if (from) arms.push({ groupId: from.id, nodeId: from.nodeId, edgeId: edge.id,
          end: 'from', crossing: demanded && isCrossingArm(edge) });
        if (to) arms.push({ groupId: to.id, nodeId: to.nodeId, edgeId: edge.id,
          end: 'to', crossing: demanded && isCrossingArm(edge) });
      }
      return { id: groups[0].id, groups, internalEdgeIds, arms };
    }) };
  }

  private static resolve(input: CrossingSourceInput): ContactGroups {
    const groups = new ContactGroups(input.nodes, input.edges, new Set(new Traffic(input).byEdge.keys()));
    const source = new SourceDomains(input);
    const roads = input.edges.filter(isCrossingArm).sort((a, b) => a.id.localeCompare(b.id));
    const cache = new Map<string, boolean>();
    let changed: boolean;
    do {
      changed = false;
      for (const edge of roads) {
        const from = groups.endpoint(edge.from, edge.id), to = groups.endpoint(edge.to, edge.id);
        if (!from || !to || groups.root(from) === groups.root(to)) continue;
        const components = groups.components();
        const first = components.find(component => component.some(group => group.id === from))!;
        const last = components.find(component => component.some(group => group.id === to))!;
        const fromDemand = first.some(group => group.junction), toDemand = last.some(group => group.junction);
        if (!fromDemand && !toDemand) continue;
        const fields = fromDemand && toDemand ? 2 : 1;
        const contactEdges = [...new Set([...first, ...last].flatMap(group => group.trafficEdgeIds))].sort();
        const key = JSON.stringify([edge.id, fields, contactEdges]);
        let conflict = cache.get(key);
        if (conflict === undefined) {
          conflict = source.conflict(edge, contactEdges, fields);
          cache.set(key, conflict);
        }
        if (conflict) { groups.join(from, to); changed = true; }
      }
    } while (changed);
    return groups;
  }
}
