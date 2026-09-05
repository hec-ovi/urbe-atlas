import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { invariantFailure } from '../../../errors';
import { difference, intersection, union } from '../../../geom/clip';
import { area, bounds } from '../../../geom/polygon';
import type { DatumSpan, GradeDatumPlan } from './schema';

interface HalfEdge { id: number; from: string; to: string; twin: number; angle: number }

/** Grade centerline topology determines eligibility before any city clipping. */
export function landFaces(boundary: Polygon, spans: DatumSpan[], roadway: Polygon[]): GradeDatumPlan['land'] {
  const points = new Map<string, Vec2>();
  const adjacency = new Map<string, HalfEdge[]>();
  const halves: HalfEdge[] = [];
  const usedSegments = new Set<string>();
  const key = (point: Vec2): string => `${point[0]},${point[1]}`;
  for (const span of spans) {
    if (span.elevation !== 'at-grade') continue;
    for (let index = 1; index < span.path.length; index++) {
      const a = span.path[index - 1];
      const b = span.path[index];
      const from = key(a);
      const to = key(b);
      const segment = from < to ? `${from}|${to}` : `${to}|${from}`;
      if (usedSegments.has(segment)) continue;
      usedSegments.add(segment);
      points.set(from, a);
      points.set(to, b);
      const id = halves.length;
      const forward = { id, from, to, twin: id + 1, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
      const backward = { id: id + 1, from: to, to: from, twin: id, angle: Math.atan2(a[1] - b[1], a[0] - b[0]) };
      halves.push(forward, backward);
      for (const half of [forward, backward]) {
        const list = adjacency.get(half.from) ?? [];
        list.push(half);
        adjacency.set(half.from, list);
      }
    }
  }
  for (const list of adjacency.values()) list.sort((a, b) => a.angle - b.angle || a.to.localeCompare(b.to));
  const visited = new Set<number>();
  const bounded: Polygon[][] = [];
  for (const first of halves) {
    if (visited.has(first.id)) continue;
    const ring: Polygon = [];
    let current = first;
    do {
      if (visited.has(current.id)) throw invariantFailure('datum grade arrangement has an incomplete face');
      visited.add(current.id);
      ring.push(points.get(current.from)!);
      const outgoing = adjacency.get(current.to)!;
      const reverse = outgoing.findIndex(half => half.id === current.twin);
      current = outgoing[(reverse + outgoing.length - 1) % outgoing.length];
    } while (current.id !== first.id);
    if (ring.length >= 3 && signedArea(ring) > 0) {
      const polygons = union([ring]);
      if (polygons.length) bounded.push(polygons);
    }
  }

  const sizes = bounded.map(polygons => polygons.reduce((sum, polygon) => sum + area(polygon), 0));
  const boxes = bounded.map(polygons => bounds(polygons.flat()));
  const land: GradeDatumPlan['land'] = [];
  bounded.forEach((face, index) => {
    // Separate components can nest. Their bounded faces remain independent
    // rather than making the enclosing component's hole buildable twice.
    const box = boxes[index];
    const inner = bounded.filter((_, other) => sizes[other] < sizes[index]
      && boxes[other].min[0] < box.max[0] && boxes[other].max[0] > box.min[0]
      && boxes[other].min[1] < box.max[1] && boxes[other].max[1] > box.min[1]).flat();
    const polygons = difference(intersection(face, [boundary]), [...roadway, ...inner]);
    if (polygons.length) land.push({ id: `gf:${index}`, kind: 'street-enclosed', polygons });
  });
  const fringe = difference([boundary], [...roadway, ...bounded.flat()]);
  if (fringe.length) land.push({ id: 'gf:outer', kind: 'outer-fringe', polygons: fringe });
  return land;
}

function signedArea(ring: Polygon): number {
  return ring.reduce((sum, a, index) => {
    const b = ring[(index + 1) % ring.length];
    return sum + a[0] * b[1] - a[1] * b[0];
  }, 0) / 2;
}
