import type { Polyline, Vec2 } from '../../schema/blueprint';
import { segmentVisitsGridCell, snapPoint } from '../geom/clip';
import { closestOnSegment, segmentIntersection } from '../geom/vec';
import { invariantFailure } from '../errors';
import type { StreetDomain } from './domain/StreetDomain';

interface ContactPath {
  points: Polyline;
  forced: boolean[];
}

interface Segment {
  line: number;
  idx: number;
  a: Vec2;
  b: Vec2;
}

/** Nodes authored endpoint cells before intersecting their routed geometry. */
export class GraphContacts {
  static node(paths: readonly Polyline[], domain: StreetDomain): ContactPath[] {
    const original = paths.map((points) => ({
      points, forced: points.map((_, index) => index === 0 || index === points.length - 1),
    }));
    const terminals = new ContactCuts();
    const routeEndpoint = (source: Segment, target: Segment): void => {
      const endpoints = [
        ...(source.idx === 0 ? [source.a] : []),
        ...(source.idx === paths[source.line].length - 2 ? [source.b] : []),
      ];
      for (const point of endpoints) {
        if (!segmentVisitsGridCell(target.a, target.b, point)) continue;
        if (!domain.coversSegment(target.a, point) || !domain.coversSegment(point, target.b)) continue;
        terminals.add(target, closestOnSegment(point, target.a, target.b).t, point);
      }
    };
    for (const [a, b] of segmentPairs(original)) {
      if (a.line === b.line) continue;
      routeEndpoint(a, b);
      routeEndpoint(b, a);
    }
    const routed = terminals.apply(original);
    for (const path of routed) {
      if (!domain.covers(path.points)) {
        throw invariantFailure('composed street contacts leave their reserved domain', { path: path.points });
      }
    }
    const intersections = new ContactCuts();
    for (const [a, b] of segmentPairs(routed)) {
      const hit = segmentIntersection(a.a, a.b, b.a, b.b);
      if (!hit) continue;
      intersections.add(a, hit.t, hit.point);
      intersections.add(b, hit.u, hit.point);
    }
    return intersections.apply(routed);
  }
}

class ContactCuts {
  private readonly cuts = new Map<string, { t: number; point: Vec2 }[]>();

  add(segment: Segment, t: number, point: Vec2): void {
    const key = `${segment.line}:${segment.idx}`;
    const entries = this.cuts.get(key) ?? [];
    entries.push({ t, point: snapPoint(point) });
    this.cuts.set(key, entries);
  }

  apply(paths: readonly ContactPath[]): ContactPath[] {
    return paths.map((path, line) => {
      const points: Polyline = [path.points[0]];
      const forced = [path.forced[0]];
      const append = (point: Vec2, node: boolean): void => {
        const last = points.at(-1)!;
        if (last[0] === point[0] && last[1] === point[1]) {
          forced[forced.length - 1] ||= node;
        } else {
          points.push(point);
          forced.push(node);
        }
      };
      for (let index = 0; index < path.points.length - 1; index++) {
        const cuts = this.cuts.get(`${line}:${index}`) ?? [];
        cuts.sort((a, b) => a.t - b.t || a.point[0] - b.point[0] || a.point[1] - b.point[1]);
        for (const cut of cuts) append(cut.point, true);
        append(path.points[index + 1], path.forced[index + 1]);
      }
      return { points, forced };
    });
  }
}

function* segmentPairs(paths: readonly ContactPath[]): Generator<[Segment, Segment]> {
  const cellSize = 50;
  const grid = new Map<string, number[]>();
  const segments: Segment[] = [];
  for (let line = 0; line < paths.length; line++) {
    const points = paths[line].points;
    for (let idx = 0; idx < points.length - 1; idx++) {
      const segment = { line, idx, a: points[idx], b: points[idx + 1] };
      const prior = new Set<number>();
      const minX = Math.floor(Math.min(segment.a[0], segment.b[0]) / cellSize);
      const maxX = Math.floor(Math.max(segment.a[0], segment.b[0]) / cellSize);
      const minZ = Math.floor(Math.min(segment.a[1], segment.b[1]) / cellSize);
      const maxZ = Math.floor(Math.max(segment.a[1], segment.b[1]) / cellSize);
      for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
        const key = `${x},${z}`;
        const bucket = grid.get(key) ?? [];
        for (const index of bucket) prior.add(index);
        bucket.push(segments.length);
        grid.set(key, bucket);
      }
      for (const index of prior) {
        const other = segments[index];
        if (line === other.line && Math.abs(idx - other.idx) <= 1) continue;
        yield [other, segment];
      }
      segments.push(segment);
    }
  }
}
