/** Publishes the level-separated transfer groups at every street node. */
import type { StreetEdge, StreetNode } from '../../schema/blueprint';
import type { BuiltNode } from './Graph';

export function streetNodesWithConnections(nodes: readonly BuiltNode[], edges: readonly StreetEdge[]): StreetNode[] {
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  return nodes.map((node) => {
    const byLevel = new Map<number, string[]>();
    for (const edgeId of node.edgeIds) {
      const edge = edgeById.get(edgeId)!;
      const profile = edge.elevationProfile;
      const level = edge.from === node.id ? profile[0].level : profile[profile.length - 1].level;
      const ids = byLevel.get(level);
      if (ids) ids.push(edgeId);
      else byLevel.set(level, [edgeId]);
    }
    const connections = [...byLevel]
      .sort(([a], [b]) => a - b)
      .map(([level, edgeIds]) => ({ level, edgeIds: edgeIds.sort() }));
    return { ...node, connections };
  });
}
