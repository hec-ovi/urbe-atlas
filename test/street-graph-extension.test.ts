import { describe, expect, it } from 'vitest';
import type { Polyline, Vec2 } from '../schema/blueprint';
import { StreetGraphBuilder } from '../src/streets/Graph';
import { resolveStreetDesign } from '../src/streets/construction/Design';
import { StreetDomain } from '../src/streets/domain/StreetDomain';

const domain = StreetDomain.reserve({
  boundary: [[0, 0], [300, 0], [300, 300], [0, 300]],
  design: resolveStreetDesign(), highways: false, alleys: true,
});

function graph(paths: Polyline[]) {
  return StreetGraphBuilder.build(paths.map((path) => ({ class: 'street', path })), {
    simplifyTolerance: 0, snapRadius: 1, domain,
  });
}

describe('street graph extension', () => {
  it('adds close junctions without moving existing nodes or changing existing path corners', () => {
    const initial = graph([
      [[100, 100], [200, 100]], [[200, 100], [200, 175], [200, 200]],
      [[200, 200], [100, 200]], [[100, 200], [100, 100]],
    ]);
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

  it('nodes snapped diagonal attachments by their grid cells without joining a neighbouring cell', () => {
    const initial = graph([
      [[100, 100], [200, 130]], [[200, 130], [200, 220]],
      [[200, 220], [100, 200]], [[100, 200], [100, 100]],
    ]);
    const from: Vec2 = [150.002, 115.001], to: Vec2 = [150.002, 210];
    const attached = StreetGraphBuilder.extend(initial, [{ class: 'alley', path: [from, to] }], { domain });
    expect(attached.edges.filter((edge) => edge.class === 'alley')).toHaveLength(1);
    for (const endpoint of [from, to]) {
      const node = attached.nodes.find((candidate) => candidate.position[0] === endpoint[0] && candidate.position[1] === endpoint[1]);
      expect(node?.edgeIds).toHaveLength(3);
    }

    const outside: Vec2 = [150.002, 115.002];
    const unjoined = StreetGraphBuilder.extend(initial, [{ class: 'alley', path: [outside, to] }], { domain });
    expect(unjoined.edges.some((edge) => edge.class === 'alley')).toBe(false);
  });
});
