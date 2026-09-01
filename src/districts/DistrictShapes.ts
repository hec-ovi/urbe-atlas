/**
 * District boundary polygons: Voronoi cells of the planned centers
 * (half-plane clipping) intersected with the city boundary.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import type { PlannedDistrict } from './DistrictPlanner';
import { difference } from '../geom/clip';
import { area } from '../geom/polygon';
import { normalize, sub } from '../geom/vec';

export class DistrictShapes {
  static cells(districts: PlannedDistrict[], boundary: Polygon, extent: number): Polygon[] {
    return districts.map((d) => {
      let cell: Polygon[] = [boundary];
      for (const other of districts) {
        if (other.index === d.index) continue;
        const u = normalize(sub(other.center, d.center));
        if (u[0] === 0 && u[1] === 0) continue;
        const m: Vec2 = [(d.center[0] + other.center[0]) / 2, (d.center[1] + other.center[1]) / 2];
        cell = difference(cell, [halfPlaneRect(m, u, extent)]);
        if (cell.length === 0) break;
      }
      cell.sort((a, b) => area(b) - area(a));
      return cell[0] ?? [d.center, d.center, d.center];
    });
  }
}

/** Rectangle covering everything on the +u side of the line through m. */
function halfPlaneRect(m: Vec2, u: Vec2, extent: number): Polygon {
  const side: Vec2 = [-u[1], u[0]];
  return [
    [m[0] - side[0] * extent, m[1] - side[1] * extent],
    [m[0] + side[0] * extent, m[1] + side[1] * extent],
    [m[0] + side[0] * extent + u[0] * extent, m[1] + side[1] * extent + u[1] * extent],
    [m[0] - side[0] * extent + u[0] * extent, m[1] - side[1] * extent + u[1] * extent],
  ];
}
