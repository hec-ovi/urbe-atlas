import { describe, expect, it } from 'vitest';
import type { Polyline, StreetClass } from '../schema/blueprint';
import { generateCity } from '../src';
import { checkStreetEdges } from '../src/invariants/streetEdges';
import { StreetGraphBuilder } from '../src/streets/Graph';
import { resolveStreetDesign } from '../src/streets/construction/Design';
import { StreetDomain } from '../src/streets/domain/StreetDomain';

const domain = StreetDomain.reserve({
  boundary: [[0, 0], [300, 0], [300, 300], [0, 300]],
  design: resolveStreetDesign(), highways: true, alleys: true,
});
const square: Polyline[] = [
  [[100, 100], [200, 100]], [[200, 100], [200, 200]],
  [[200, 200], [100, 200]], [[100, 200], [100, 100]],
];

function build(path: Polyline, kind: StreetClass = 'street') {
  return StreetGraphBuilder.build([
    ...square.map((points) => ({ class: 'street' as const, path: points })),
    { class: kind, path },
  ], { simplifyTolerance: 0, snapRadius: 10, domain });
}

describe('street graph resolution', () => {
  it('keeps a canonical run for endpoint-compatible traces within the declared resolution', () => {
    const result = build([[200, 100], [100.3, 100.2], [100, 100]]);
    expect(result.edges).toHaveLength(4);
    expect(result.edges.map((edge) => edge.path)).toContainEqual(square[0]);

    const withRoad = build([[200, 100], [100.3, 100.2], [100, 100]], 'road');
    expect(withRoad.edges).toHaveLength(4);
    expect(withRoad.edges.filter((edge) => edge.class === 'road')).toHaveLength(1);
  });

  it('retains geometrically separate routes and a returning path within the same distance band', () => {
    expect(build([[100, 100], [150, 115], [200, 100]]).edges).toHaveLength(5);
    const returning: Polyline = [
      [100, 100], [145, 101], [150, 102], [149, 105],
      [146, 106], [148, 109], [155, 109], [200, 100],
    ];
    const result = build(returning);
    expect(result.edges).toHaveLength(5);
    expect(result.edges.map((edge) => edge.path)).toContainEqual(returning);
  });

  it('keeps distinct highway and pedestrian semantics even for identical centerlines', () => {
    for (const kind of ['highway', 'alley'] as const) {
      const result = build([...square[0]].reverse(), kind);
      expect(result.edges).toHaveLength(5);
      expect(result.edges.filter((edge) => edge.class === kind)).toHaveLength(1);
      expect(result.edges.filter((edge) => edge.class === 'street')).toHaveLength(4);
    }
  });

  it('applies the same source families in the published-edge invariant', () => {
    const city = generateCity({
      seed: 'interior-review-1km-01', maxFloors: 8,
      features: { highways: false, trains: false, subways: false },
    });
    const edge = city.streets.edges.find((candidate) => candidate.class === 'street')!;
    city.streets.edges.push({ ...edge, id: 'semantic-copy', class: 'highway' });
    expect(() => checkStreetEdges(city)).not.toThrow();
    city.streets.edges[city.streets.edges.length - 1].class = 'road';
    expect(() => checkStreetEdges(city)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });
});
