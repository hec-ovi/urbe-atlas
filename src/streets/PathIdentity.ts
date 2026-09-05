import type { Polyline } from '../../schema/blueprint';
import { GRID_STEP } from '../geom/clip';

type GridPoint = [bigint, bigint];

/** Whole physical path identity on the published grid, independent of direction and subdivision. */
export function physicalPathKey(path: Polyline): string {
  const corners: GridPoint[] = [];
  for (const point of path) {
    const next: GridPoint = [BigInt(Math.round(point[0] / GRID_STEP)), BigInt(Math.round(point[1] / GRID_STEP))];
    const last = corners.at(-1);
    if (last && last[0] === next[0] && last[1] === next[1]) continue;
    while (corners.length > 1) {
      const a = corners[corners.length - 2], b = corners[corners.length - 1];
      const ux = b[0] - a[0], uz = b[1] - a[1], vx = next[0] - b[0], vz = next[1] - b[1];
      if (ux * vz !== uz * vx || ux * vx + uz * vz < 0n) break;
      corners.pop();
    }
    corners.push(next);
  }
  const points = corners.map(([x, z]) => `${x},${z}`);
  const forward = points.join(';'), reverse = points.reverse().join(';');
  return forward < reverse ? forward : reverse;
}
