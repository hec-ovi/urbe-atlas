/**
 * Contract: a highway is a through route. Its chains reach the city edge, and
 * a deck built from them touches the ground only there, never over a block.
 */
import { describe, expect, it } from 'vitest';
import { generateCity } from '../src';
import { HIGHWAY_EXIT_TOLERANCE, highwayRuns } from '../src/streets/Highways';
import { distanceToOutline } from '../src/geom/polygon';
import type { Vec2 } from '../schema/blueprint';

// a 3 km city is where the network forks; a small one has a single chain
const bp = generateCity({ seed: 'urbe', size: { width: 3000, depth: 3000 } });
const highways = bp.streets.edges.filter((e) => e.class === 'highway');
const runs = highwayRuns(bp.streets.edges);

/** How many highway edges meet at the node standing on this point. */
function highwayDegree(point: Vec2): number {
  const node = bp.streets.nodes.find((n) => Math.hypot(n.position[0] - point[0], n.position[1] - point[1]) < 1e-6);
  if (!node) return 0;
  return highways.filter((e) => e.from === node.id || e.to === node.id).length;
}

const length = (path: Vec2[]): number =>
  path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);

describe('highway runs', () => {
  it('carries every metre of highway, each in exactly one run', () => {
    expect(highways.length).toBeGreaterThan(0);
    expect(runs.reduce((sum, r) => sum + length(r.path), 0)).toBeCloseTo(
      highways.reduce((sum, e) => sum + length(e.path), 0),
      3,
    );
  });

  it('cuts a run only where the network ends or forks', () => {
    for (const run of runs) {
      const start = run.path[0];
      const end = run.path[run.path.length - 1];
      if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 1e-6) continue; // a ring closes on itself
      for (const point of [start, end]) {
        const degree = highwayDegree(point);
        expect(degree, `run end at ${point} joins ${degree} highway edges`).not.toBe(2);
      }
    }
  });

  it('ramps to the ground only at a terminus, and every terminus is at the city edge', () => {
    for (const run of runs) {
      for (const [point, ramps] of [
        [run.path[0], run.rampAtStart],
        [run.path[run.path.length - 1], run.rampAtEnd],
      ] as [Vec2, boolean][]) {
        expect(ramps, `ramp flag at ${point}`).toBe(highwayDegree(point) === 1);
        if (ramps) expect(distanceToOutline(point, bp.meta.boundary)).toBeLessThanOrEqual(HIGHWAY_EXIT_TOLERANCE);
      }
    }
  });
});
