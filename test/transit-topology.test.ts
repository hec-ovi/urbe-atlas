import { describe, expect, it } from 'vitest';
import { generateCity } from '../src';
import { checkBusRouteTopology } from '../src/invariants/routes';
import type { CityBlueprint } from '../schema/blueprint';

let cached: CityBlueprint | undefined;
const smallCity = (): CityBlueprint => (cached ??= generateCity({
  seed: 'urbe-small',
  size: { width: 800, depth: 800 },
}));

describe('bus route topology', () => {
  it('keeps every urbe-small route transition inside one node connection group', () => {
    const bp = smallCity();
    expect(bp.transit.busRoutes.length).toBeGreaterThan(0);
    expect(() => checkBusRouteTopology(bp)).not.toThrow();
    const edgeById = new Map(bp.streets.edges.map((edge) => [edge.id, edge]));
    const nodeById = new Map(bp.streets.nodes.map((node) => [node.id, node]));
    for (const route of bp.transit.busRoutes) {
      for (let i = 1; i < route.edgeIds.length; i++) {
        const previous = edgeById.get(route.edgeIds[i - 1])!;
        const next = edgeById.get(route.edgeIds[i])!;
        const nodeId = [previous.from, previous.to].find((id) => id === next.from || id === next.to)!;
        expect(nodeById.get(nodeId)!.connections.some((group) =>
          group.edgeIds.includes(previous.id) && group.edgeIds.includes(next.id)),
        `${route.id} ${previous.id} to ${next.id} at ${nodeId}`).toBe(true);
      }
    }
  });

  it('rejects a bus turn between grade and an elevated crossing', () => {
    const broken = structuredClone(smallCity()) as CityBlueprint;
    const node = broken.streets.nodes.find((candidate) => candidate.connections.length > 1)!;
    broken.transit.busRoutes[0].edgeIds = [node.connections[0].edgeIds[0], node.connections[1].edgeIds[0]];
    expect(() => checkBusRouteTopology(broken)).toThrow(/changes level/);
  });
});
