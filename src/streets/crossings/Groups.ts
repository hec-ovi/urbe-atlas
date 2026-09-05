import type { StreetEdge, StreetNode } from '../../../schema/blueprint';

export interface ContactGroup { id: string; nodeId: string; edgeIds: string[]; trafficEdgeIds: string[]; junction: boolean }

/** Preserves published connection groups; equal coordinates never create a transfer. */
export class ContactGroups {
  readonly groups = new Map<string, ContactGroup>();
  private readonly endpoints = new Map<string, string>();
  private readonly parents = new Map<string, string>();

  constructor(nodes: readonly StreetNode[], edges: readonly StreetEdge[], traffic: ReadonlySet<string>) {
    const eligible = new Map(edges.filter((e) => e.sidewalk.left > 0 && e.sidewalk.right > 0).map((e) => [e.id, e]));
    for (const node of nodes) for (let index = 0; index < node.connections.length; index++) {
      const connection = node.connections[index];
      if (connection.level !== 0) continue;
      const edgeIds = connection.edgeIds.filter((id) => eligible.has(id)).sort();
      if (!edgeIds.length) continue;
      const first = eligible.get(edgeIds[0])!, second = eligible.get(edgeIds[1]);
      const continuation = connection.edgeIds.length === 2 && edgeIds.length === 2 && first.width > 0 && !!second && second.width > 0
        && !!first.crossSection?.runId && first.crossSection.runId === second.crossSection?.runId;
      const id = `${node.id}:connection:${index}`;
      this.groups.set(id, { id, nodeId: node.id, edgeIds,
        trafficEdgeIds: connection.edgeIds.filter(edgeId => traffic.has(edgeId)).sort(),
        junction: edgeIds.length >= 2 && !continuation });
      this.parents.set(id, id);
      for (const edgeId of edgeIds) this.endpoints.set(`${node.id}:${edgeId}`, id);
    }
  }
  endpoint(nodeId: string, edgeId: string): string | undefined { return this.endpoints.get(`${nodeId}:${edgeId}`); }
  root(id: string): string {
    const parent = this.parents.get(id)!;
    if (parent === id) return id;
    const root = this.root(parent);
    this.parents.set(id, root);
    return root;
  }
  join(a: string, b: string): void {
    const left = this.root(a), right = this.root(b);
    if (left !== right) this.parents.set(left < right ? right : left, left < right ? left : right);
  }
  components(): ContactGroup[][] {
    const result = new Map<string, ContactGroup[]>();
    for (const group of [...this.groups.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      const key = this.root(group.id), list = result.get(key) ?? [];
      list.push(group); result.set(key, list);
    }
    return [...result.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, groups]) => groups);
  }
}
