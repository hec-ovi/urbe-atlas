/**
 * District boundaries follow the city grid. The planned centers are split by
 * cuts perpendicular to a grid axis, halving the set each time, so every
 * district comes out an axis-aligned rectangle, clipped to the city rectangle.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import type { PlannedDistrict } from './DistrictPlanner';
import { difference } from '../geom/clip';
import { area } from '../geom/polygon';
import { dot, fromAngle } from '../geom/vec';

export class DistrictShapes {
  static cells(
    districts: PlannedDistrict[],
    boundary: Polygon,
    extent: number,
    gridAngle: number,
  ): Polygon[] {
    const cells = new Array<Polygon>(districts.length);
    const axes: Vec2[] = [fromAngle(gridAngle), fromAngle(gridAngle + Math.PI / 2)];

    const place = (members: PlannedDistrict[], region: Polygon[], path: string): void => {
      if (members.length === 1) {
        cells[members[0].index] = largest(region) ?? [members[0].center, members[0].center, members[0].center];
        return;
      }
      const line = cutLine(members, axes);
      const near = members.filter((d) => dot(d.center, line.normal) < line.at);
      const far = members.filter((d) => dot(d.center, line.normal) >= line.at);
      const beyond = halfPlane(line.normal, line.at, extent);
      const before = halfPlane([-line.normal[0], -line.normal[1]], -line.at, extent);
      place(near, difference(region, [beyond]), `${path}n`);
      place(far, difference(region, [before]), `${path}f`);
    };

    place([...districts].sort((a, b) => a.index - b.index), [boundary], 'd');
    return cells;
  }
}

/** Where to cut a set of centers: across their wider spread, on the grid. */
function cutLine(members: PlannedDistrict[], axes: Vec2[]): { normal: Vec2; at: number } {
  const spread = axes.map((axis) => {
    const cs = members.map((d) => dot(d.center, axis));
    return Math.max(...cs) - Math.min(...cs);
  });
  const axis = spread[0] >= spread[1] ? axes[0] : axes[1];
  const along = members.map((d) => dot(d.center, axis)).sort((a, b) => a - b);
  const k = Math.floor(along.length / 2);
  return { normal: axis, at: (along[k] + along[k - 1]) / 2 };
}

const largest = (region: Polygon[]): Polygon | undefined =>
  [...region].sort((a, b) => area(b) - area(a))[0];

/** Everything on the far side of the line `dot(p, normal) = at`. */
function halfPlane(normal: Vec2, at: number, extent: number): Polygon {
  const side: Vec2 = [-normal[1], normal[0]];
  const base: Vec2 = [normal[0] * at, normal[1] * at];
  return [
    [base[0] - side[0] * extent, base[1] - side[1] * extent],
    [base[0] + side[0] * extent, base[1] + side[1] * extent],
    [base[0] + side[0] * extent + normal[0] * extent, base[1] + side[1] * extent + normal[1] * extent],
    [base[0] - side[0] * extent + normal[0] * extent, base[1] - side[1] * extent + normal[1] * extent],
  ];
}
