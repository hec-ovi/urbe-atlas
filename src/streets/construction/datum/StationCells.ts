import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { intersection, snapPoint, union } from '../../../geom/clip';
import type { DatumStation } from './schema';
import { PathStations } from './PathStations';

/** Shared station half-planes partition the source corridor, including its joins. */
export class StationCells {
  private readonly cuts = new Map<number, { before: Polygon; after: Polygon }>();

  constructor(private readonly source: PathStations, private readonly radius: number) {}

  cutLine(station: DatumStation): [Vec2, Vec2] {
    const plane = this.plane(station);
    return [plane.before[0], plane.before[1]];
  }

  slice(polygons: Polygon[], start: number, end: number): Polygon[] {
    if (polygons.length === 0 || end <= start) return [];
    if (start === 0 && end === this.source.length) return polygons;
    const distances = this.source.ordered([start, end, ...this.source.distances.filter(value => value > start && value < end)]);
    const pieces: Polygon[] = [];
    for (let index = 1; index < distances.length; index++) {
      const a = this.source.at(distances[index - 1]);
      const b = this.source.at(distances[index]);
      const length = b.distance - a.distance;
      const direction: Vec2 = [(b.point[0] - a.point[0]) / length, (b.point[1] - a.point[1]) / length];
      const side: Vec2 = [-direction[1], direction[0]];
      const reach = this.radius / Math.min(
        Math.abs(direction[0] * a.tangent[0] + direction[1] * a.tangent[1]),
        Math.abs(direction[0] * b.tangent[0] + direction[1] * b.tangent[1]),
      );
      const corner = (point: Vec2, along: number, across: number): Vec2 => [
        point[0] + direction[0] * along + side[0] * across,
        point[1] + direction[1] * along + side[1] * across,
      ];
      let cell: Polygon[] = [[corner(a.point, -reach, -this.radius), corner(b.point, reach, -this.radius),
        corner(b.point, reach, this.radius), corner(a.point, -reach, this.radius)]];
      if (a.distance > 0) cell = intersection(cell, [this.plane(a).after]);
      if (b.distance < this.source.length) cell = intersection(cell, [this.plane(b).before]);
      pieces.push(...intersection(polygons, cell));
    }
    return union(pieces);
  }

  private plane(station: DatumStation): { before: Polygon; after: Polygon } {
    const cached = this.cuts.get(station.distance);
    if (cached) return cached;
    const extent = this.source.length + this.radius;
    const tangent = station.tangent;
    const side: Vec2 = [-tangent[1], tangent[0]];
    const a = snapPoint([station.point[0] - side[0] * extent, station.point[1] - side[1] * extent]);
    const b = snapPoint([station.point[0] + side[0] * extent, station.point[1] + side[1] * extent]);
    const move = (point: Vec2, sign: number): Vec2 => snapPoint([
      point[0] + tangent[0] * extent * sign, point[1] + tangent[1] * extent * sign,
    ]);
    const plane = { before: [a, b, move(b, -1), move(a, -1)], after: [b, a, move(a, 1), move(b, 1)] };
    this.cuts.set(station.distance, plane);
    return plane;
  }
}
