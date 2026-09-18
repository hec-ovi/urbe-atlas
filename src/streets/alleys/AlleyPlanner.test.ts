import { expect, it } from 'vitest';
import { AlleyPlanner } from '../AlleyPlanner';
import { StreetDomain } from '../domain/StreetDomain';
import { resolveStreetDesign } from '../construction/Design';
import { Rng } from '../../core/rng';
import type { Polygon, Vec2 } from '../../../schema/blueprint';
import type { AlleyNetwork } from './schema';

const block: Polygon = [[30, 30], [210, 30], [210, 120], [30, 120]];
const domain = StreetDomain.reserve({
  boundary: [[0, 0], [240, 0], [240, 150], [0, 150]],
  design: resolveStreetDesign(), highways: false, alleys: true,
});
const edges: AlleyNetwork['edges'] = [
  { class: 'street', path: [[20, 20], [220, 20]] },
  { class: 'road', path: [[20, 24], [220, 24]] },
  { class: 'street', path: [[20, 130], [220, 130]] },
  { class: 'road', path: [[20, 126], [220, 126]] },
];
const junctions: Vec2[] = [[20, 20], [220, 20], [220, 130], [20, 130]];

function plan(network: AlleyNetwork) {
  return AlleyPlanner.plan([block], junctions, () => ({ kind: 'commercial', tier: 'poor' }), Rng.from(1, 'alleys'), network);
}

it('joins the first actual street beyond each mouth while keeping the snapped source inside the domain', () => {
  const alleys = plan({ edges, domain });
  expect(alleys.length).toBeGreaterThan(0);
  for (const path of alleys) {
    expect(domain.covers(path)).toBe(true);
    expect(path.map((point) => point[1]).sort((a, b) => a - b)).toEqual([24, 126]);
    expect(path.flat().every((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7)).toBe(true);
  }
  expect(plan({ edges, domain })).toEqual(alleys);
});

it('requires eligible, domain-contained terminals on both sides before accepting a candidate', () => {
  expect(plan({ edges: edges.slice(0, 2), domain })).toEqual([]);
  expect(plan({ edges: edges.map((edge) => ({ ...edge, class: 'highway' })), domain })).toEqual([]);
  const narrowerDomain = StreetDomain.reserve({
    boundary: [[0, 0], [240, 0], [240, 125 + domain.clearance], [0, 125 + domain.clearance]],
    design: resolveStreetDesign(), highways: false, alleys: true,
  });
  expect(narrowerDomain.covers(block)).toBe(true);
  expect(narrowerDomain.covers(edges[3].path)).toBe(false);
  expect(plan({ edges, domain: narrowerDomain })).toEqual([]);
});
