import { invariantFailure } from '../../errors';
import { extent, overlaps } from './BoxIndex';
import { compare, cross, leftProbe, ringSign, sign, vector, type Point, type PointPool, type Region, type Ring } from './Exact';
import { chain, nodeSegments, segments } from './Segments';
import { WindingField } from './WindingField';

interface HalfEdge { id: number; a: Point; b: Point; twin: HalfEdge; next: HalfEdge; owner: number; visited: boolean }

function simpleCycles(walk: Ring): Region {
  const result: Region = [], stack: Point[] = [], positions = new Map<string, number>();
  for (const point of [...walk, walk[0]]) {
    const previous = positions.get(point.key);
    if (previous !== undefined) {
      const ring = stack.slice(previous);
      if (ring.length >= 3 && ringSign(ring)) result.push(ring);
      for (const removed of stack.splice(previous + 1)) positions.delete(removed.key);
    } else { positions.set(point.key, stack.length); stack.push(point); }
  }
  return result;
}

/** One indexed arrangement assigns every face by source winding and mask priority. */
export function overlay(source: Region, masks: Region[], pool: PointPool): Region[] {
  const result: Region[] = Array.from({ length: masks.length + 1 }, () => []);
  if (!source.length) return result;
  const sourceField = new WindingField(source), sourceBox = sourceField.box, fields = masks.map(rings => new WindingField(rings));
  const edges = segments([...source, ...masks.flat()]).filter(edge => overlaps(sourceBox, edge.box));
  edges.forEach((edge, index) => { edge.id = index; });
  nodeSegments(edges, pool);
  const atoms = new Map<string, [Point, Point]>();
  for (const edge of edges) {
    const points = chain(edge);
    for (let index = 1; index < points.length; index++) {
      let a = points[index - 1], b = points[index];
      if (compare(a, b) > 0) [a, b] = [b, a];
      atoms.set(`${a.key}|${b.key}`, [a, b]);
    }
  }
  const halves: HalfEdge[] = [], outgoing = new Map<string, HalfEdge[]>();
  for (const [a, b] of atoms.values()) {
    const forward = { id: halves.length, a, b, owner: -2, visited: false } as HalfEdge;
    const backward = { id: halves.length + 1, a: b, b: a, owner: -2, visited: false } as HalfEdge;
    forward.twin = backward; backward.twin = forward;
    halves.push(forward, backward);
    for (const edge of [forward, backward]) {
      let list = outgoing.get(edge.a.key);
      if (!list) outgoing.set(edge.a.key, list = []);
      list.push(edge);
    }
  }
  const angle = (a: HalfEdge, b: HalfEdge): number => {
    const p = vector(a.a, a.b), q = vector(b.a, b.b);
    const upper = (v: typeof p) => v.y > 0n || (v.y === 0n && v.x >= 0n) ? 0 : 1;
    return upper(p) - upper(q) || -sign(cross(p, q)) || a.id - b.id;
  };
  const positions = new Map<number, number>();
  for (const list of outgoing.values()) {
    list.sort(angle);
    list.forEach((edge, index) => positions.set(edge.id, index));
  }
  for (const edge of halves) {
    const list = outgoing.get(edge.b.key)!;
    edge.next = list[(positions.get(edge.twin.id)! + list.length - 1) % list.length];
  }
  for (const start of halves) {
    if (start.owner !== -2) continue;
    const probe = leftProbe(start.a, start.b, pool), pointBox = extent([[probe.base]]);
    let owner = -1;
    if (sourceField.winding(probe, pointBox)) {
      owner = fields.findIndex(field => field.winding(probe, pointBox) !== 0);
      if (owner === -1) owner = masks.length;
    }
    let edge = start;
    do {
      if (edge.owner !== -2) throw invariantFailure('partition face walk is incoherent');
      edge.owner = owner;
      edge = edge.next;
    } while (edge !== start);
  }
  for (const start of halves) {
    if (start.visited || start.owner < 0 || start.owner === start.twin.owner) continue;
    const walk: Ring = [];
    let edge = start;
    do {
      if (edge.visited) throw invariantFailure('partition boundary walk is incoherent');
      edge.visited = true; walk.push(edge.a);
      const list = outgoing.get(edge.b.key)!, reverse = positions.get(edge.twin.id)!;
      let next: HalfEdge | undefined;
      for (let step = 1; step <= list.length; step++) {
        const candidate = list[(reverse + list.length - step) % list.length];
        if (candidate.owner === start.owner && candidate.owner !== candidate.twin.owner) { next = candidate; break; }
      }
      if (!next) throw invariantFailure('partition boundary is open');
      edge = next;
    } while (edge !== start);
    result[start.owner].push(...simpleCycles(walk));
  }
  return result;
}
