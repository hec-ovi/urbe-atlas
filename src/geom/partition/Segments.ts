import { BoxIndex, extent, type Box } from './BoxIndex';
import { compareX, compareY, intersection, orient, sign, type Point, type PointPool, type Ring } from './Exact';

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
    const abC = side(edge, other.a), abD = side(edge, other.b);
    if (abC * abD > 0) continue;
    const cdA = side(other, edge.a), cdB = side(other, edge.b);
    if (cdA * cdB > 0) continue;
    if (abC * abD < 0 && cdA * cdB < 0) {
      const point = intersection(edge.a, edge.b, other.a, other.b, pool);
      edge.points.set(point.key, point); other.points.set(point.key, point);
      continue;
    }
    if (!abC) addCollinear(other.a, edge);
    if (!abD) addCollinear(other.b, edge);
    if (!cdA) addCollinear(edge.a, other);
    if (!cdB) addCollinear(edge.b, other);
  }
}

function side(edge: Segment, point: Point): number {
  return point.key === edge.a.key || point.key === edge.b.key ? 0 : sign(orient(edge.a, edge.b, point));
}

function addCollinear(point: Point, edge: Segment): void {
  if (point.key !== edge.a.key && point.key !== edge.b.key
    && compareX(point, edge.a) * compareX(point, edge.b) <= 0
    && compareY(point, edge.a) * compareY(point, edge.b) <= 0) edge.points.set(point.key, point);
}

export function chain(edge: Segment): Point[] {
  const order = compareX(edge.a, edge.b) ? compareX : compareY;
  const direction = order(edge.a, edge.b);
  return [...edge.points.values()].sort((a, b) => -direction * order(a, b));
}
