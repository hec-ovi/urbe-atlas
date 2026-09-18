/** Street graph contract: physical path identity, resolution, extension and authored contacts. */
import { describe, expect, it } from 'vitest';
import type { Polyline, StreetClass, Vec2 } from '../schema/blueprint';
import { StreetGraphBuilder } from '../src/streets/Graph';
import { resolveStreetDesign } from '../src/streets/construction/Design';
import { StreetDomain } from '../src/streets/domain/StreetDomain';

const domain = StreetDomain.reserve({
  boundary: [[0, 0], [1400, 0], [1400, 1000], [0, 1000]],
  design: resolveStreetDesign(), highways: true, alleys: true,
});
const square: Polyline[] = [
  [[100, 100], [200, 100]], [[200, 100], [200, 200]],
  [[200, 200], [100, 200]], [[100, 200], [100, 100]],
];

const build = (paths: Polyline[], snapRadius = 0, simplifyTolerance = 0) =>
  StreetGraphBuilder.build(paths.map((path) => ({ class: 'street' as const, path })), { simplifyTolerance, snapRadius, domain });
const withExtra = (path: Polyline, kind: StreetClass = 'street', snapRadius = 10) => StreetGraphBuilder.build(
  [...square.map((points) => ({ class: 'street' as const, path: points })), { class: kind, path }],
  { simplifyTolerance: 0, snapRadius, domain });

describe('physical path identity', () => {
  it('keeps one edge per source family, in either direction, with the higher-priority class', () => {
    const graph = StreetGraphBuilder.build([
      ...square.map((path) => ({ class: 'street' as const, path })),
      { class: 'road', path: [[200, 100], [100, 100]] },
    ], { simplifyTolerance: 0, snapRadius: 1, domain });
    expect(graph.nodes).toHaveLength(4);
    expect(graph.edges).toHaveLength(4);
    expect(graph.edges.filter((edge) => edge.class === 'road')).toHaveLength(1);
    expect(graph.nodes.every((node) => node.edgeIds.length === 2)).toBe(true);

    // a highway or a pedestrian alley on the same centerline is its own family
    for (const kind of ['highway', 'alley'] as const) {
      const separate = withExtra([...square[0]].reverse(), kind);
      expect(separate.edges).toHaveLength(5);
      expect(separate.edges.filter((edge) => edge.class === kind)).toHaveLength(1);
      expect(separate.edges.filter((edge) => edge.class === 'street')).toHaveLength(4);
    }
  });

  it('resolves endpoint-compatible traces inside the radius and retains separate or returning routes', () => {
    const resolved = withExtra([[200, 100], [100.3, 100.2], [100, 100]]);
    expect(resolved.edges).toHaveLength(4);
    expect(resolved.edges.map((edge) => edge.path)).toContainEqual(square[0]);
    const roadWins = withExtra([[200, 100], [100.3, 100.2], [100, 100]], 'road');
    expect(roadWins.edges.filter((edge) => edge.class === 'road')).toHaveLength(1);

    expect(withExtra([[100, 100], [150, 115], [200, 100]]).edges).toHaveLength(5);
    const returning: Polyline = [
      [100, 100], [145, 101], [150, 102], [149, 105],
      [146, 106], [148, 109], [155, 109], [200, 100],
    ];
    const kept = withExtra(returning);
    expect(kept.edges).toHaveLength(5);
    expect(kept.edges.map((edge) => edge.path)).toContainEqual(returning);

    // exact identity at zero radius keeps two paths that share endpoints but not their middle
    const parallel: Polyline[] = [[[100, 100], [150, 155], [200, 100]], [[100, 100], [150, 159], [200, 100]]];
    const exact = build(parallel, 1);
    expect(exact.nodes).toHaveLength(2);
    expect(exact.edges.map((edge) => edge.path)).toEqual(parallel);
  });
});

describe('extension and authored contacts', () => {
  it('adds new lines without moving existing nodes, corners or repeating itself', () => {
    const initial = build([
      [[100, 100], [200, 100]], [[200, 100], [200, 175], [200, 200]],
      [[200, 200], [100, 200]], [[100, 200], [100, 100]],
    ], 1);
    const snapshot = structuredClone(initial);
    const line = { class: 'alley' as const, path: [[199.5, 100], [199.5, 200]] as Polyline };
    const extended = StreetGraphBuilder.extend(initial, [line], { domain });
    expect(initial).toEqual(snapshot);
    expect(extended.nodes).toHaveLength(6);
    expect(extended.edges).toHaveLength(7);
    for (const node of initial.nodes) expect(extended.nodes.map((candidate) => candidate.position)).toContainEqual(node.position);
    const extendedPoints = extended.edges.flatMap((edge) => edge.path);
    for (const point of initial.edges.flatMap((edge) => edge.path)) expect(extendedPoints).toContainEqual(point);
    expect(extended.edges.find((edge) => edge.class === 'alley')?.path).toEqual(line.path);
    expect(StreetGraphBuilder.extend(initial, [line], { domain })).toEqual(extended);
  });

  it('accepts a terminal only inside its authored grid cell', () => {
    const angled = build([
      [[100, 100], [200, 130]], [[200, 130], [200, 220]],
      [[200, 220], [100, 200]], [[100, 200], [100, 100]],
    ], 1);
    const from: Vec2 = [150.002, 115.001], to: Vec2 = [150.002, 210];
    const attached = StreetGraphBuilder.extend(angled, [{ class: 'alley', path: [from, to] }], { domain });
    expect(attached.edges.filter((edge) => edge.class === 'alley')).toHaveLength(1);
    for (const endpoint of [from, to]) {
      expect(attached.nodes.find((node) => node.position[0] === endpoint[0] && node.position[1] === endpoint[1])?.edgeIds).toHaveLength(3);
    }
    // one millimetre outside the cell the alley has no accepted contact, so it is not traced
    const unjoined = StreetGraphBuilder.extend(angled, [{ class: 'alley', path: [[150.002, 115.002], to] }], { domain });
    expect(unjoined.edges.some((edge) => edge.class === 'alley')).toBe(false);

    // the same rule holds on an oblique authored street, and the composed graph equals a full rebuild
    const street: Polyline = [[787.959, 826.81], [813.049, 803.209], [827.942, 755.486], [835.948, 722.993]];
    const alley: Polyline = [[750.099, 758.545], [819.071, 783.914]];
    const terminal: Vec2 = [819.071, 783.914], other: Vec2 = [750.099, 758.545];
    const oblique = build([street, [street.at(-1)!, other], [other, street[0]]]);
    const traced = StreetGraphBuilder.extend(oblique, [{ class: 'alley', path: alley }], { domain });
    expect(traced.nodes).toHaveLength(oblique.nodes.length + 1);
    expect(traced.edges).toHaveLength(oblique.edges.length + 2);
    expect(traced.nodes.find((node) => node.position[0] === terminal[0] && node.position[1] === terminal[1])?.edgeIds).toHaveLength(3);
    for (const edge of traced.edges) expect(domain.covers(edge.path)).toBe(true);
    expect(StreetGraphBuilder.build([
      ...oblique.edges.map(({ class: kind, path }) => ({ class: kind, path })), { class: 'alley', path: alley },
    ], { simplifyTolerance: 0, snapRadius: 0, domain })).toEqual(traced);
    expect(StreetGraphBuilder.extend(traced, [], { domain })).toEqual(traced);
  });

  it('keeps exact authored joins and separate contacts one grid step apart', () => {
    // simplification keeps a shared source endpoint as an anchor, and infers no nearby join
    const joined = StreetGraphBuilder.build([
      ...[[[100, 100], [150, 100.65], [200, 100]], [[200, 100], [200, 200]],
        [[200, 200], [100, 200]], [[100, 200], [100, 100]]].map((path) => ({ class: 'street' as const, path: path as Polyline })),
      { class: 'alley', path: [[150, 100.65], [150, 200]] },
    ], { simplifyTolerance: 1.5, snapRadius: 10, domain });
    expect(joined.nodes).toHaveLength(6);
    expect(joined.edges).toHaveLength(7);
    expect(joined.nodes.find((node) => node.position[0] === 150 && node.position[1] === 100.65)?.edgeIds).toHaveLength(3);
    expect(joined.edges.find((edge) => edge.class === 'alley')?.path).toEqual([[150, 100.65], [150, 200]]);
    const apart = StreetGraphBuilder.build([
      ...[[[100, 100], [150, 100.65], [200, 100]], [[200, 100], [200, 200]],
        [[200, 200], [100, 200]], [[100, 200], [100, 100]]].map((path) => ({ class: 'street' as const, path: path as Polyline })),
      { class: 'alley', path: [[150, 100.7], [150, 200]] },
    ], { simplifyTolerance: 1.5, snapRadius: 10, domain });
    expect(apart.edges.some((edge) => edge.class === 'alley')).toBe(false);

    const initial = build(square);
    const paths: Polyline[] = [[[150, 100], [150, 200]], [[150.001, 100], [150.001, 200]]];
    const result = StreetGraphBuilder.extend(initial, paths.map((path) => ({ class: 'alley' as const, path })), { domain });
    expect(result.nodes).toHaveLength(8);
    expect(result.edges).toHaveLength(10);
    expect(result.edges.filter((edge) => edge.class === 'alley')).toHaveLength(2);
    for (const point of paths.flat()) {
      expect(result.nodes.find((node) => node.position[0] === point[0] && node.position[1] === point[1])?.edgeIds).toHaveLength(3);
    }
    expect(StreetGraphBuilder.extend(initial, [...paths].reverse().map((path) => ({ class: 'alley' as const, path })), { domain }))
      .toEqual(result);

    // a path can hold both an interior crossing and a terminal contact
    const crossing = StreetGraphBuilder.extend(initial, [{ class: 'alley', path: [[100, 150], [160, 90], [180, 100]] }], { domain });
    expect(crossing.nodes.find((node) => node.position[0] === 150 && node.position[1] === 100)?.edgeIds).toHaveLength(4);
    expect(crossing.nodes.find((node) => node.position[0] === 180 && node.position[1] === 100)?.edgeIds).toHaveLength(3);
    expect(crossing.edges.filter((edge) => edge.class === 'alley')).toHaveLength(2);
  });
});
