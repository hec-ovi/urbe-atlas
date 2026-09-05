import type { BuildingGrid, Polygon } from '../../schema/blueprint';
import type { HostingProfile } from './FootprintHost';
import { area, bounds } from '../geom/polygon';
import { coreFitForRect } from './core';
import { RectangleCandidates, type RectangleCandidate } from './RectangleCandidates';
import { GridFrame } from './GridFrame';
import { GridLand } from './GridLand';

/** Complete construction-grid rectangles contained by the whole polygon boundary. */
export class RectangularFootprint {
  static fit(inset: Polygon, profile: HostingProfile, grid: BuildingGrid): Polygon | null {
    const frame = new GridFrame(grid);
    const land = new GridLand(inset, frame);
    const candidates: RectangleCandidate[] = [];
    const box = bounds(land.polygon);
    const u0 = Math.ceil((box.min[0] - land.roundoff) / grid.spacing);
    const v0 = Math.ceil((box.min[1] - land.roundoff) / grid.spacing);
    const cols = Math.floor((box.max[0] + land.roundoff) / grid.spacing) - u0;
    const rows = Math.floor((box.max[1] + land.roundoff) / grid.spacing) - v0;
    if (cols < 1 || rows < 1) return null;
    const heights = new Int32Array(cols);
    for (let row = 0; row < rows; row++) {
      const bottom = (v0 + row) * grid.spacing;
      const intervals = land.intervals(bottom, bottom + grid.spacing);
      let col = 0;
      for (const [left, right] of intervals) {
        const start = Math.max(0, Math.ceil((left - land.roundoff) / grid.spacing) - u0);
        const end = Math.min(cols, Math.floor((right + land.roundoff) / grid.spacing) - u0);
        heights.fill(0, col, start);
        for (col = Math.max(col, start); col < end; col++) heights[col]++;
      }
      heights.fill(0, col);
      this.rowCandidates(heights, u0, v0 + row + 1, candidates);
    }
    const minimumArea = profile.keep * area(inset);
    const search = new RectangleCandidates(candidates, ({ width, depth }) => {
      width *= grid.spacing; depth *= grid.spacing;
      if (Math.min(width, depth) < profile.band || width * depth < minimumArea) return false;
      const fit = coreFitForRect(width, depth);
      return fit.floorCap > 0 && (!profile.heavy || fit.compact);
    });
    let candidate: RectangleCandidate | undefined;
    while ((candidate = search.take())) {
      if (land.contains(candidate, grid.spacing)) return frame.polygon(candidate);
      search.refine(candidate);
    }
    return null;
  }

  private static rowCandidates(
    heights: Int32Array, u0: number, top: number, candidates: RectangleCandidate[],
  ): void {
    const stack: { start: number; height: number }[] = [];
    for (let col = 0; col <= heights.length; col++) {
      const height = col === heights.length ? 0 : heights[col];
      let start = col;
      while (stack.length && stack[stack.length - 1].height > height) {
        const item = stack.pop()!;
        start = item.start;
        const width = col - start, depth = item.height;
        candidates.push({ u: u0 + start, v: top - depth, width, depth });
      }
      if (height && (!stack.length || stack[stack.length - 1].height < height)) stack.push({ start, height });
    }
  }
}
