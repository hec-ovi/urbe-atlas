/**
 * District boundaries follow the city grid. The planned centers are split by
 * cuts perpendicular to a grid axis, halving the set each time, so every
 * district comes out a rectangle in grid space, clipped to the irregular city
 * boundary. `irregularity` is the only thing that lets a cut leave the axis: it
 * slides the cut off the midpoint and leans it off the grid. At irregularity 0
 * the districts are exact rectangles on the grid.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import type { PlannedDistrict } from './DistrictPlanner';
import type { Rng } from '../core/rng';
import { difference } from '../geom/clip';
import { area } from '../geom/polygon';
import { dot, fromAngle } from '../geom/vec';

/** How far off the grid a fully irregular city may lean a district cut. */
const MAX_LEAN = Math.PI / 12;
/** How far off the midpoint it may slide one, as a share of the gap it splits. */
const MAX_SLIDE = 0.25;

export class DistrictShapes {
  static cells(
    districts: PlannedDistrict[],
    boundary: Polygon,
    extent: number,
    gridAngle: number,
    irregularity: number,
    rng: Rng,
  ): Polygon[] {
    const cells = new Array<Polygon>(districts.length);
    const axes: Vec2[] = [fromAngle(gridAngle), fromAngle(gridAngle + Math.PI / 2)];

    const place = (members: PlannedDistrict[], region: Polygon[], path: string): void => {
      if (members.length === 1) {
        cells[members[0].index] = largest(region) ?? [members[0].center, members[0].center, members[0].center];
        return;
      }
      const line = cutLine(members, axes, irregularity, rng.fork(path));
      const near = members.filter((d) => dot(d.center, line.normal) < line.at);
      const far = members.filter((d) => dot(d.center, line.normal) >= line.at);
      if (near.length === 0 || far.length === 0) {
        // the lean pushed every center to one side: split on the plain axis
        const straight = { normal: line.axis, at: dot(line.through, line.axis) };
        place(members.filter((d) => dot(d.center, straight.normal) < straight.at), region, `${path}n`);
        place(members.filter((d) => dot(d.center, straight.normal) >= straight.at), region, `${path}f`);
        return;
      }
      const beyond = halfPlane(line.normal, line.at, extent);
      const before = halfPlane([-line.normal[0], -line.normal[1]], -line.at, extent);
      place(near, difference(region, [beyond]), `${path}n`);
      place(far, difference(region, [before]), `${path}f`);
    };

    place([...districts].sort((a, b) => a.index - b.index), [boundary], 'd');
    return cells;
  }
}

/** Where to cut a set of centers: across their wider spread, on the grid unless irregularity leans it. */
function cutLine(
  members: PlannedDistrict[],
  axes: Vec2[],
  irregularity: number,
  rng: Rng,
): { normal: Vec2; at: number; axis: Vec2; through: Vec2 } {
  const spread = axes.map((axis) => {
    const cs = members.map((d) => dot(d.center, axis));
    return Math.max(...cs) - Math.min(...cs);
  });
  const axis = spread[0] >= spread[1] ? axes[0] : axes[1];
  const along = members.map((d) => dot(d.center, axis)).sort((a, b) => a - b);
  const k = Math.floor(along.length / 2);
  const gap = along[k] - along[k - 1];
  const at = (along[k] + along[k - 1]) / 2 + rng.range(-1, 1) * irregularity * MAX_SLIDE * gap;
  const lean = rng.range(-1, 1) * irregularity * MAX_LEAN;
  const normal = rotate(axis, lean);
  // the leaned cut passes through the same point on the axis as the straight one
  const through: Vec2 = [axis[0] * at, axis[1] * at];
  return { normal, at: dot(through, normal), axis, through };
}

const rotate = (v: Vec2, angle: number): Vec2 => [
  v[0] * Math.cos(angle) - v[1] * Math.sin(angle),
  v[0] * Math.sin(angle) + v[1] * Math.cos(angle),
];

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
