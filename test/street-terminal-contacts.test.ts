import { describe, expect, it } from 'vitest';
import type { Polyline, Vec2 } from '../schema/blueprint';
import { StreetGraphBuilder } from '../src/streets/Graph';
import { resolveStreetDesign } from '../src/streets/construction/Design';
import { StreetDomain } from '../src/streets/domain/StreetDomain';

const domain = StreetDomain.reserve({
  boundary: [[0, 0], [1400, 0], [1400, 1000], [0, 1000]],
  design: resolveStreetDesign(), highways: false, alleys: true,
});

function build(paths: Polyline[]) {
  return StreetGraphBuilder.build(paths.map((path) => ({ class: 'street', path })), {
    simplifyTolerance: 0, snapRadius: 0, domain,
  });
}

describe('authored street terminal contacts', () => {
  it.each<{ street: Polyline; alley: Polyline; terminal: Vec2 }>([
    {
      street: [[787.959, 826.81], [813.049, 803.209], [827.942, 755.486], [835.948, 722.993]],
      alley: [[750.099, 758.545], [819.071, 783.914]], terminal: [819.071, 783.914],
    },
    {
      street: [[944.352, 755.483], [1001.788, 735.259], [1025.231, 672.936]],
      alley: [[1009.719, 714.176], [938.686, 697.282]], terminal: [1009.719, 714.176],
    },
  ])('publishes one contact at the authored endpoint $terminal', ({ street, alley, terminal }) => {
    const other = alley.find((point) => point[0] !== terminal[0] || point[1] !== terminal[1])!;
    const initial = build([street, [street.at(-1)!, other], [other, street[0]]]);
    const snapshot = structuredClone(initial);
    const result = StreetGraphBuilder.extend(initial, [{ class: 'alley', path: alley }], { domain });
    expect(initial).toEqual(snapshot);
    expect(result.nodes).toHaveLength(initial.nodes.length + 1);
    expect(result.edges).toHaveLength(initial.edges.length + 2);
    expect(result.nodes.find((node) => node.position[0] === terminal[0] && node.position[1] === terminal[1])?.edgeIds).toHaveLength(3);
    expect(result.edges.filter((edge) => edge.class === 'alley').map((edge) => edge.path)).toEqual([alley]);
    for (const edge of result.edges) expect(domain.covers(edge.path)).toBe(true);
    for (const node of initial.nodes) expect(result.nodes.map((candidate) => candidate.position)).toContainEqual(node.position);
    expect(StreetGraphBuilder.build([
      ...initial.edges.map(({ class: kind, path }) => ({ class: kind, path })), { class: 'alley', path: alley },
    ], { simplifyTolerance: 0, snapRadius: 0, domain })).toEqual(result);
    expect(StreetGraphBuilder.extend(result, [], { domain })).toEqual(result);
  });

  it('preserves separate authored contacts one grid step apart', () => {
    const initial = build([
      [[100, 100], [200, 100]], [[200, 100], [200, 200]],
      [[200, 200], [100, 200]], [[100, 200], [100, 100]],
    ]);
    const paths: Polyline[] = [[[150, 100], [150, 200]], [[150.001, 100], [150.001, 200]]];
    const result = StreetGraphBuilder.extend(initial, paths.map((path) => ({ class: 'alley', path })), { domain });
    expect(result.nodes).toHaveLength(8);
    expect(result.edges).toHaveLength(10);
    expect(result.edges.filter((edge) => edge.class === 'alley')).toHaveLength(2);
    for (const point of paths.flat()) {
      expect(result.nodes.find((node) => node.position[0] === point[0] && node.position[1] === point[1])?.edgeIds).toHaveLength(3);
    }
    expect(StreetGraphBuilder.extend(initial, [...paths].reverse().map((path) => ({ class: 'alley', path })), { domain })).toEqual(result);
  });

  it('retains a separate interior crossing on a path that also has a terminal contact', () => {
    const initial = build([
      [[100, 100], [200, 100]], [[200, 100], [200, 200]],
      [[200, 200], [100, 200]], [[100, 200], [100, 100]],
    ]);
    const result = StreetGraphBuilder.extend(initial, [{
      class: 'alley', path: [[100, 150], [160, 90], [180, 100]],
    }], { domain });
    expect(result.nodes.find((node) => node.position[0] === 150 && node.position[1] === 100)?.edgeIds).toHaveLength(4);
    expect(result.nodes.find((node) => node.position[0] === 180 && node.position[1] === 100)?.edgeIds).toHaveLength(3);
    expect(result.edges.filter((edge) => edge.class === 'alley')).toHaveLength(2);
  });

  it('discovers endpoint-cell contacts at both broadphase bucket boundaries', () => {
    const initial = build([
      [[100, 135], [200, 165.001]], [[200, 165.001], [200, 250]],
      [[200, 250], [100, 250]], [[100, 250], [100, 135]],
    ]);
    const terminal: Vec2 = [150, 150], other: Vec2 = [150, 250];
    const result = StreetGraphBuilder.extend(initial, [{ class: 'alley', path: [terminal, other] }], { domain });
    expect(result.nodes.find((node) => node.position[0] === terminal[0] && node.position[1] === terminal[1])?.edgeIds).toHaveLength(3);
    expect(result.nodes).toHaveLength(6);
    expect(result.edges.filter((edge) => edge.class === 'alley').map((edge) => edge.path)).toEqual([[terminal, other]]);
    const outside: Vec2 = [150, 150.002];
    const unjoined = StreetGraphBuilder.extend(initial, [{ class: 'alley', path: [outside, other] }], { domain });
    expect(unjoined.edges.some((edge) => edge.class === 'alley')).toBe(false);
  });
});
