import { describe, expect, it } from 'vitest';
import type { Polyline } from '../schema/blueprint';
import { StreetGraphBuilder } from '../src/streets/Graph';
import { resolveStreetDesign } from '../src/streets/construction/Design';
import { StreetDomain } from '../src/streets/domain/StreetDomain';

const domain = StreetDomain.reserve({
  boundary: [[0, 0], [300, 0], [300, 300], [0, 300]],
  design: resolveStreetDesign(), highways: false, alleys: true,
});
const streets: Polyline[] = [
  [[100, 100], [150, 100.65], [200, 100]], [[200, 100], [200, 200]],
  [[200, 200], [100, 200]], [[100, 200], [100, 100]],
];

function build(endpointHeight: number) {
  return StreetGraphBuilder.build([
    ...streets.map((path) => ({ class: 'street' as const, path })),
    { class: 'alley', path: [[150, endpointHeight], [150, 200]] },
  ], { simplifyTolerance: 1.5, snapRadius: 10, domain });
}

describe('authored source junctions', () => {
  it('keeps an exact joined source endpoint as a required simplification anchor', () => {
    const graph = build(100.65);
    expect(graph.nodes).toHaveLength(6);
    expect(graph.edges).toHaveLength(7);
    const node = graph.nodes.find((candidate) => candidate.position[0] === 150 && candidate.position[1] === 100.65);
    expect(node?.edgeIds).toHaveLength(3);
    expect(graph.edges.find((edge) => edge.class === 'alley')?.path).toEqual([[150, 100.65], [150, 200]]);
  });

  it('does not infer a source join from a nearby coordinate', () => {
    expect(build(100.7).edges.some((edge) => edge.class === 'alley')).toBe(false);
  });
});
