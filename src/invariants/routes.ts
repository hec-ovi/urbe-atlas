/** Bus paths must follow the level-separated street topology in edge order. */
import type { CityBlueprint } from '../../schema/blueprint';
import { invariantFailure } from '../errors';

export function checkBusRouteTopology(bp: CityBlueprint): void {
  const edgeById = new Map(bp.streets.edges.map((edge) => [edge.id, edge]));
  const nodeById = new Map(bp.streets.nodes.map((node) => [node.id, node]));
  for (const route of bp.transit.busRoutes) {
    for (let i = 1; i < route.edgeIds.length; i++) {
      const previous = edgeById.get(route.edgeIds[i - 1]);
      const next = edgeById.get(route.edgeIds[i]);
      if (!previous || !next) continue;
      const nodeId = [previous.from, previous.to].find((id) => id === next.from || id === next.to);
      if (!nodeId) {
        throw invariantFailure(`bus route ${route.id} has disconnected edges ${previous.id} and ${next.id}`);
      }
      const node = nodeById.get(nodeId);
      const connected = node?.connections.some((group) =>
        group.edgeIds.includes(previous.id) && group.edgeIds.includes(next.id));
      if (!connected) {
        throw invariantFailure(`bus route ${route.id} changes level between ${previous.id} and ${next.id} at ${nodeId}`);
      }
    }
  }
}
