import { describe, expect, it } from 'vitest';
import { AlleyPlanner } from '../AlleyPlanner';
import { StreetDomain } from '../domain/StreetDomain';
import { resolveStreetDesign } from '../construction/Design';
import { Rng } from '../../core/rng';
import { GRID_STEP, snapPoint } from '../../geom/clip';
import { closestOnSegment, dist } from '../../geom/vec';
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

describe('alley source attachment', () => {
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

  it('keeps diagonal street terminals within the shared coordinate-grid cell', () => {
    const transform = ([x, y]: Vec2): Vec2 => snapPoint([
      1000 + (x - 120) * Math.cos(0.31) - (y - 75) * Math.sin(0.31),
      700 + (x - 120) * Math.sin(0.31) + (y - 75) * Math.cos(0.31),
    ]);
    const rotatedEdges = edges.map((edge) => ({ ...edge, path: edge.path.map(transform) }));
    const rotatedDomain = StreetDomain.reserve({
      boundary: ([[0, 0], [240, 0], [240, 150], [0, 150]] as Polygon).map(transform),
      design: resolveStreetDesign(), highways: false, alleys: true,
    });
    const alleys = AlleyPlanner.plan([block.map(transform)], junctions.map(transform),
      () => ({ kind: 'commercial', tier: 'poor' }), Rng.from(1, 'alleys'), { edges: rotatedEdges, domain: rotatedDomain });
    expect(alleys.length).toBeGreaterThan(0);
    for (const path of alleys) {
      expect(rotatedDomain.covers(path)).toBe(true);
      for (const terminal of path) {
        const distance = Math.min(...[rotatedEdges[1], rotatedEdges[3]].map((edge) =>
          dist(terminal, closestOnSegment(terminal, edge.path[0], edge.path[1]).point)));
        expect(distance).toBeLessThanOrEqual(GRID_STEP / Math.sqrt(2));
      }
    }
  });

  it('requires eligible, domain-contained terminals on both sides before accepting a candidate', () => {
    expect(plan({ edges: edges.slice(0, 2), domain })).toEqual([]);
    expect(plan({ edges: edges.map((edge) => ({ ...edge, class: 'highway' })), domain })).toEqual([]);
    const narrowerDomain = StreetDomain.reserve({
      boundary: [[0, 0], [240, 0], [240, 140], [0, 140]],
      design: resolveStreetDesign(), highways: false, alleys: true,
    });
    expect(plan({ edges, domain: narrowerDomain })).toEqual([]);
  });
});
