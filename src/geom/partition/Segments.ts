import { BoxIndex, extent, type Box } from './BoxIndex';
import { compareX, compareY, intersection, onSegment, orient, sign, type Point, type PointPool, type Ring } from './Exact';

export interface Segment { id: number; a: Point; b: Point; box: Box; points: Map<string, Point> }

export function segments(rings: Ring[]): Segment[] {
  return segmentPairs(rings.flatMap(ring => ring.map((a, index) => ({ a, b: ring[(index + 1) % ring.length] }))));
}

export function segmentPairs(pairs: { a: Point; b: Point }[]): Segment[] {
  return pairs
    .filter(edge => edge.a.key !== edge.b.key).map((edge, id) => ({ ...edge, id, box: extent([[edge.a, edge.b]]),
      points: new Map([[edge.a.key, edge.a], [edge.b.key, edge.b]]) }));
}

/** Nodes shared crossings and collinear endpoints once using exact predicates. */
export function nodeSegments(edges: Segment[], pool: PointPool): void {
  const index = new BoxIndex(edges);
  for (const edge of edges) for (const other of index.query(edge.box)) {
    if (other.id <= edge.id) continue;
    const abC = sign(orient(edge.a, edge.b, other.a)), abD = sign(orient(edge.a, edge.b, other.b));
    const cdA = sign(orient(other.a, other.b, edge.a)), cdB = sign(orient(other.a, other.b, edge.b));
    if (abC * abD < 0 && cdA * cdB < 0) {
      const point = intersection(edge.a, edge.b, other.a, other.b, pool);
      edge.points.set(point.key, point); other.points.set(point.key, point);
      continue;
    }
    const add = (point: Point, target: Segment) => { if (onSegment(point, target.a, target.b)) target.points.set(point.key, point); };
    if (!abC) add(other.a, edge);
    if (!abD) add(other.b, edge);
    if (!cdA) add(edge.a, other);
    if (!cdB) add(edge.b, other);
  }
}

export function chain(edge: Segment): Point[] {
  const order = compareX(edge.a, edge.b) ? compareX : compareY;
  const direction = order(edge.a, edge.b);
  return [...edge.points.values()].sort((a, b) => -direction * order(a, b));
}
