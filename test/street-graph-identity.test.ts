import { describe, expect, it } from 'vitest';
import type { CityBlueprint, Polyline } from '../schema/blueprint';
import { generateCity } from '../src';
import { checkStreetEdges } from '../src/invariants/streetEdges';
import { StreetGraphBuilder } from '../src/streets/Graph';
import { resolveStreetDesign } from '../src/streets/construction/Design';
import { StreetDomain } from '../src/streets/domain/StreetDomain';

const domain = StreetDomain.reserve({
  boundary: [[0, 0], [300, 0], [300, 300], [0, 300]],
  design: resolveStreetDesign(), highways: false, alleys: false,
});
const options = { simplifyTolerance: 0, snapRadius: 1, domain };

let review: CityBlueprint | undefined;
const reviewCity = (): CityBlueprint => (review ??= generateCity({
  seed: 'interior-review-1km-01', size: { width: 1000, depth: 1000 }, maxFloors: 8,
  features: { highways: false, trains: false, subways: false },
}));

describe('street graph physical path identity', () => {
  it('keeps one physical edge for reversed traces and retains its highest-priority class', () => {
    const paths: Polyline[] = [
      [[100, 100], [200, 100]], [[200, 100], [200, 200]],
      [[200, 200], [100, 200]], [[100, 200], [100, 100]],
    ];
    const graph = StreetGraphBuilder.build([
      ...paths.map((path) => ({ class: 'street' as const, path })),
      { class: 'road', path: [[200, 100], [100, 100]] },
    ], options);
    expect(graph.nodes).toHaveLength(4);
    expect(graph.edges).toHaveLength(4);
    expect(graph.edges.filter((edge) => edge.class === 'road')).toHaveLength(1);
    expect(graph.nodes.every((node) => node.edgeIds.length === 2)).toBe(true);
  });

  it('retains distinct paths with the same endpoints and nearby midpoints', () => {
    const paths: Polyline[] = [
      [[100, 100], [150, 155], [200, 100]],
      [[100, 100], [150, 159], [200, 100]],
    ];
    const graph = StreetGraphBuilder.build(paths.map((path) => ({ class: 'street', path })), options);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges.map((edge) => edge.path)).toEqual(paths);
  });

  it('publishes each review city path only once, in either direction', () => {
    const paths = reviewCity().streets.edges.map((edge) => {
      const forward = JSON.stringify(edge.path), reverse = JSON.stringify([...edge.path].reverse());
      return forward < reverse ? forward : reverse;
    });
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('rejects a second physical path even when reversed and subdivided', () => {
    const city = structuredClone(reviewCity());
    const edge = city.streets.edges[0];
    edge.path = [[100, 100], [200, 100]];
    city.streets.edges = [edge, {
      ...edge, id: 'duplicate', from: edge.to, to: edge.from,
      path: [[200, 100], [150, 100], [100, 100]],
    }];
    expect(() => checkStreetEdges(city)).toThrowError(expect.objectContaining({
      code: 'E_INVARIANT', message: expect.stringContaining('duplicates the physical path'),
    }));
  });
});
