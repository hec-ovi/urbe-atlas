import { describe, expect, it } from 'vitest';
import type { BuildingGrid, Polygon, Vec2 } from '../schema/blueprint';
import { area, bounds } from '../src/geom/polygon';
import { FootprintHost, type HostingProfile } from '../src/zoning/FootprintHost';
import { RectangularFootprint } from '../src/zoning/RectangularFootprint';
import { rectangleCoverageGap } from './rectangleCoverage';

const profile: HostingProfile = { setback: 0, band: 9.74, heavy: false, keep: 0 };
const grid: BuildingGrid = { origin: [0, 0], angle: 0, spacing: 0.5 };

describe('rectangular hosting contract', () => {
  it('retains complete cells on an exact lot boundary and enforces the requested band', () => {
    const inset: Polygon = [[0, 0], [20, 0], [20, 20], [0, 20]];
    expect(RectangularFootprint.fit(inset, profile, grid)).toEqual(inset);
    expect(RectangularFootprint.fit(inset, { ...profile, band: 20.5 }, grid)).toBeNull();
    const host = new FootprintHost({ shape: 'rectangle', grid });
    expect(host.fit(inset, profile)).toEqual({ footprint: inset, floorCap: Infinity });
    expect(host.fit(inset, { ...profile, setback: 1, keep: 1 })?.footprint)
      .toEqual([[1, 1], [19, 1], [19, 19], [1, 19]]);
    expect(RectangularFootprint.fit([[0, 0], [12, 0], [12, 24], [0, 24]], { ...profile, heavy: true }, grid))
      .toBeNull();
  });

  it('matches exhaustive best-fit selection through concave bays on a rotated construction grid', () => {
    const construction: BuildingGrid = { origin: [1056.234, 2034.876], angle: 0.271828, spacing: 2 };
    const outlines: Polygon[] = [
      [[0, 0], [26, 0], [26, 10], [16, 10], [16, 24], [0, 24]],
      [[0, 0], [24, 0], [24, 24], [16, 24], [16, 12], [12, 12], [12, 24], [0, 24]],
      [[0, 0], [26, 0], [23.999, 24], [0, 24]],
    ];
    for (const outline of outlines) {
      const inset = outline.map((point) => world(point, construction));
      expect(RectangularFootprint.fit(inset, profile, construction)).toEqual(exhaustive(outline, profile, construction));
    }
  });
});

function world([u, v]: Vec2, frame: BuildingGrid): Vec2 {
  const c = Math.cos(frame.angle), s = Math.sin(frame.angle);
  return [frame.origin[0] + u * c - v * s, frame.origin[1] + u * s + v * c];
}

/** Small-grid reference enumerates every rectangle, independently of the search. */
function exhaustive(outline: Polygon, required: HostingProfile, frame: BuildingGrid): Polygon | null {
  const box = bounds(outline.map(([x, y]) => [x / frame.spacing, y / frame.spacing]));
  let best: { footprint: Polygon; cells: number; short: number; u: number; v: number; width: number } | undefined;
  for (let u = Math.floor(box.min[0]); u < box.max[0]; u++) {
    for (let v = Math.floor(box.min[1]); v < box.max[1]; v++) {
      for (let right = u + 1; right <= Math.ceil(box.max[0]); right++) {
        for (let top = v + 1; top <= Math.ceil(box.max[1]); top++) {
          const width = (right - u) * frame.spacing, depth = (top - v) * frame.spacing;
          const short = Math.min(width, depth), long = Math.max(width, depth);
          if (short < required.band || short < 9.74 || long < 11.14) continue;
          if (width * depth > 460 && long < 17.64 && !(short >= 12.14 && long >= 13.74)) continue;
          if (required.heavy && (short < 12.14 || long < 13.74)) continue;
          const cells = (right - u) * (top - v);
          if (best && (best.cells - cells || best.short - short || u - best.u || v - best.v || best.width - width) >= 0) continue;
          const footprint = [[u, v], [right, v], [right, top], [u, top]]
            .map(([x, y]) => world([x * frame.spacing, y * frame.spacing], frame));
          const gap = rectangleCoverageGap(outline, [u * frame.spacing, v * frame.spacing],
            [right * frame.spacing, top * frame.spacing]);
          if (width * depth < required.keep * area(outline) || gap > 128 * Number.EPSILON * width * depth) continue;
          best = { footprint, cells, short, u, v, width };
        }
      }
    }
  }
  return best?.footprint ?? null;
}
