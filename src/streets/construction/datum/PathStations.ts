import type { ElevationPoint, Polyline, Vec2 } from '../../../../schema/blueprint';
import { invariantFailure } from '../../../errors';
import { levelAt } from '../highway';
import type { DatumSpan, DatumStation } from './schema';

const DISTANCE_EPSILON = 1e-9;

export class PathStations {
  readonly distances: number[] = [0];
  readonly length: number;
  private readonly stations = new Map<number, DatumStation>();

  constructor(readonly path: Polyline, readonly profile: ElevationPoint[], readonly edgeId: string) {
    if (path.length < 2 || path.some(point => point.some(value => !Number.isFinite(value)))) {
      throw invariantFailure(`datum edge ${edgeId} has no finite path`);
    }
    for (let index = 1; index < path.length; index++) {
      const length = Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]);
      if (length <= 0) throw invariantFailure(`datum edge ${edgeId} repeats a path point`);
      this.distances.push(this.distances[index - 1] + length);
    }
    this.length = this.distances[this.distances.length - 1];
    if (profile.length < 2 || Math.abs(profile[0].distance) > 1e-7
      || Math.abs(profile[profile.length - 1].distance - this.length) > 1e-7
      || profile.some((knot, index) => !Number.isFinite(knot.distance) || !Number.isFinite(knot.level)
        || (index > 0 && knot.distance <= profile[index - 1].distance))) {
      throw invariantFailure(`datum edge ${edgeId} has an incomplete elevation profile`);
    }
  }

  cuts(levels: readonly number[] = []): number[] {
    const cuts = this.profile.map(knot => knot.distance);
    for (let index = 1; index < this.profile.length; index++) {
      const a = this.profile[index - 1];
      const b = this.profile[index];
      for (const level of levels) {
        if (level <= Math.min(a.level, b.level) || level >= Math.max(a.level, b.level)) continue;
        cuts.push(a.distance + (b.distance - a.distance) * (level - a.level) / (b.level - a.level));
      }
    }
    return this.ordered(cuts);
  }

  ordered(values: readonly number[]): number[] {
    const sorted = values.map(value => {
      const vertex = this.distances.find(distance => Math.abs(distance - value) <= DISTANCE_EPSILON);
      return vertex ?? Math.max(0, Math.min(this.length, value));
    }).sort((a, b) => a - b);
    return sorted.filter((value, index) => index === 0 || value - sorted[index - 1] > DISTANCE_EPSILON);
  }

  at(distance: number): DatumStation {
    const cached = this.stations.get(distance);
    if (cached) return cached;
    let index = 1;
    while (index < this.distances.length - 1 && this.distances[index] < distance - DISTANCE_EPSILON) index++;
    const a = this.path[index - 1];
    const b = this.path[index];
    const span = this.distances[index] - this.distances[index - 1];
    const direction: Vec2 = [(b[0] - a[0]) / span, (b[1] - a[1]) / span];
    const t = Math.max(0, Math.min(1, (distance - this.distances[index - 1]) / span));
    const point: Vec2 = t === 0 ? a : t === 1 ? b : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    let tangent = direction;
    if (Math.abs(distance - this.distances[index]) <= DISTANCE_EPSILON && index < this.path.length - 1) {
      const next = this.path[index + 1];
      const nextLength = this.distances[index + 1] - this.distances[index];
      const sum: Vec2 = [direction[0] + (next[0] - b[0]) / nextLength, direction[1] + (next[1] - b[1]) / nextLength];
      const magnitude = Math.hypot(...sum);
      if (magnitude <= DISTANCE_EPSILON) throw invariantFailure(`datum edge ${this.edgeId} reverses at a station`);
      tangent = [sum[0] / magnitude, sum[1] / magnitude];
    }
    const station = { distance, point, tangent, level: levelAt(this.profile, distance) };
    this.stations.set(distance, station);
    return station;
  }

  between(start: number, end: number): Polyline {
    return [this.at(start).point, ...this.path.filter((_, index) =>
      this.distances[index] > start + DISTANCE_EPSILON && this.distances[index] < end - DISTANCE_EPSILON), this.at(end).point];
  }

  spans(roadwayTop: number): DatumSpan[] {
    const cuts = this.cuts([roadwayTop]);
    return cuts.slice(1).map((end, index) => {
      const start = cuts[index];
      return {
        id: `gs:${this.edgeId}:${index}`, edgeId: this.edgeId,
        start: this.at(start), end: this.at(end), path: this.between(start, end),
        elevation: levelAt(this.profile, (start + end) / 2) === roadwayTop
          && this.at(start).level === roadwayTop && this.at(end).level === roadwayTop ? 'at-grade' : 'off-grade',
      };
    });
  }
}
