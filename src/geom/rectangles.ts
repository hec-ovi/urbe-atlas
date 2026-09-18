/**
 * Cuts axis-aligned regions into axis-aligned rectangles.
 *
 * The plan is rectangles, so leftover land (an L around a tiled block, the
 * fringe outside the outer streets) is published as rectangles too instead of
 * one stair-shaped ring. A vertical scanline splits the region at every corner
 * x, pairs the crossings of each slab by the even-odd rule, then joins
 * neighbouring slabs that share a band. Regions with a slanted or curved edge
 * (only water has one) come back unchanged.
 */
import type { Polygon } from '../../schema/blueprint';

const EPS = 1e-6;

export function rectanglesOf(rings: Polygon[]): Polygon[] {
  if (rings.length === 0) return [];
  if (!rings.every(isRectilinear)) return rings;
  const xs = [...new Set(rings.flat().map(point => point[0]))].sort((a, b) => a - b);
  type Band = { z0: number; z1: number; x0: number; x1: number };
  const open: Band[] = [];
  const out: Polygon[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const [x0, x1] = [xs[i], xs[i + 1]];
    if (x1 - x0 <= EPS) continue;
    const bands = crossings(rings, (x0 + x1) / 2);
    for (let b = open.length - 1; b >= 0; b--) {
      const band = open[b];
      const found = bands.find(value => Math.abs(value.z0 - band.z0) <= EPS && Math.abs(value.z1 - band.z1) <= EPS);
      if (found && Math.abs(band.x1 - x0) <= EPS) { band.x1 = x1; found.taken = true; continue; }
      out.push(rectangle(band));
      open.splice(b, 1);
    }
    for (const band of bands) if (!band.taken) open.push({ z0: band.z0, z1: band.z1, x0, x1 });
  }
  for (const band of open) out.push(rectangle(band));
  return out;
}

function rectangle({ x0, z0, x1, z1 }: { x0: number; z0: number; x1: number; z1: number }): Polygon {
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

/** Bands of the region on the vertical line at `x`, by the even-odd rule. */
function crossings(rings: Polygon[], x: number): { z0: number; z1: number; taken?: boolean }[] {
  const zs: number[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if ((a[0] - x) * (b[0] - x) < 0) zs.push(a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]));
    }
  }
  zs.sort((a, b) => a - b);
  const bands: { z0: number; z1: number }[] = [];
  for (let i = 0; i + 1 < zs.length; i += 2) if (zs[i + 1] - zs[i] > EPS) bands.push({ z0: zs[i], z1: zs[i + 1] });
  return bands;
}

function isRectilinear(ring: Polygon): boolean {
  return ring.length >= 4 && ring.every((point, index) => {
    const next = ring[(index + 1) % ring.length];
    return Math.abs(point[0] - next[0]) <= EPS || Math.abs(point[1] - next[1]) <= EPS;
  });
}
