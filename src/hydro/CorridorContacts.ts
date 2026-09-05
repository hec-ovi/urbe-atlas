import { intersection } from '../geom/clip';
import type { HydroPoint, HydroPolygon } from './types';

interface Contact {
  path: HydroPoint[];
  corridor: HydroPolygon[];
}

/** Exact contact geometry, with a route span identifying each reservation. */
export class CorridorContacts {
  private readonly stations: number[] = [0];

  constructor(private readonly path: HydroPoint[], private readonly corridor: HydroPolygon[]) {
    for (let index = 1; index < path.length; index++) {
      this.stations.push(this.stations[index - 1] + distance(path[index - 1], path[index]));
    }
  }

  within(surfaces: HydroPolygon[]): Contact[] {
    return intersection(this.corridor, surfaces).map(canonicalRing).map((polygon) => {
      const stations = polygon.map((point) => this.nearestStation(point));
      return { path: this.span(Math.min(...stations), Math.max(...stations)), corridor: [polygon] };
    }).sort((a, b) => this.nearestStation(a.path[0]) - this.nearestStation(b.path[0])
      || JSON.stringify(a.corridor).localeCompare(JSON.stringify(b.corridor)));
  }

  private nearestStation(point: HydroPoint): number {
    let nearest = Number.POSITIVE_INFINITY;
    let station = 0;
    for (let index = 1; index < this.path.length; index++) {
      const a = this.path[index - 1];
      const b = this.path[index];
      const length = this.stations[index] - this.stations[index - 1];
      const along = Math.max(0, Math.min(length, ((point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])) / length));
      const projection = interpolate(a, b, along / length);
      const separation = distance(point, projection);
      if (separation >= nearest) continue;
      nearest = separation;
      station = this.stations[index - 1] + along;
    }
    return station;
  }

  private span(from: number, to: number): HydroPoint[] {
    const output: HydroPoint[] = [];
    for (let index = 1; index < this.path.length; index++) {
      const start = this.stations[index - 1];
      const end = this.stations[index];
      if (end < from || start > to) continue;
      const a = this.path[index - 1];
      const b = this.path[index];
      for (const station of [Math.max(start, from), Math.min(end, to)]) {
        const point = interpolate(a, b, (station - start) / (end - start)).map(snap) as HydroPoint;
        if (!output.length || distance(output[output.length - 1], point) > 0) output.push(point);
      }
    }
    // A cap's contact may project to one endpoint; its reservation has real area.
    if (output.length === 1) output.push([...output[0]]);
    return output;
  }
}

function canonicalRing(polygon: HydroPolygon): HydroPolygon {
  let first = 0;
  polygon.forEach((point, index) => {
    if (point[0] < polygon[first][0] || (point[0] === polygon[first][0] && point[1] < polygon[first][1])) first = index;
  });
  return [...polygon.slice(first), ...polygon.slice(0, first)];
}

function distance(a: HydroPoint, b: HydroPoint): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function interpolate(a: HydroPoint, b: HydroPoint, t: number): HydroPoint {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function snap(value: number): number {
  return Math.round(value * 1000) / 1000;
}
