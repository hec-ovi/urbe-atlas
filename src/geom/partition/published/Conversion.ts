import { invariantFailure } from '../../../errors';
import { BoxIndex, extent } from '../BoxIndex';
import { intersection, onSegment, orient, type Point, type PointPool, type Ring } from '../Exact';
import type { Segment } from '../Segments';
import { add, compare, divide, fraction, midpoint, multiply, subtract, type Fraction } from './Rational';
import { unresolvedEdges } from './Unresolved';

interface Interval { low: Fraction; high: Fraction }
interface Constraint { edge: Segment; witness: Point }
const bits = new DataView(new ArrayBuffer(8));

function adjacent(value: number, upward: boolean): number {
  if (value === 0) return upward ? Number.MIN_VALUE : -Number.MIN_VALUE;
  bits.setFloat64(0, value);
  const direction = (value > 0) === upward ? 1n : -1n;
  bits.setBigUint64(0, bits.getBigUint64(0) + direction);
  return bits.getFloat64(0);
}

function interval(value: number, pool: PointPool): Interval {
  let low = value, high = value;
  for (let index = 0; index < 4; index++) { low = adjacent(low, false); high = adjacent(high, true); }
  if (!Number.isFinite(low) || !Number.isFinite(high)) throw invariantFailure('published conversion interval is not finite');
  const a = pool.input([low, 0]), b = pool.input([high, 0]);
  return { low: fraction(a.x, a.w), high: fraction(b.x, b.w) };
}

function contains(bounds: Interval, value: Fraction): boolean {
  return compare(bounds.low, value) <= 0 && compare(value, bounds.high) <= 0;
}

/** The fixed segment must intersect the point's complete conversion envelope. */
function witness(point: Point, edge: Segment, pool: PointPool): Point | undefined {
  const bounds = [interval(point.value[0], pool), interval(point.value[1], pool)];
  const start = [fraction(edge.a.x, edge.a.w), fraction(edge.a.y, edge.a.w)];
  const end = [fraction(edge.b.x, edge.b.w), fraction(edge.b.y, edge.b.w)];
  let low = fraction(0n), high = fraction(1n);
  for (let axis = 0; axis < 2; axis++) {
    const delta = subtract(end[axis], start[axis]);
    if (delta.n === 0n) { if (!contains(bounds[axis], start[axis])) return; continue; }
    let a = divide(subtract(bounds[axis].low, start[axis]), delta);
    let b = divide(subtract(bounds[axis].high, start[axis]), delta);
    if (compare(a, b) > 0) [a, b] = [b, a];
    if (compare(a, low) > 0) low = a;
    if (compare(b, high) < 0) high = b;
  }
  if (compare(low, high) > 0 || compare(high, fraction(0n)) <= 0 || compare(low, fraction(1n)) >= 0) return;
  const t = midpoint(low, high);
  const x = add(start[0], multiply(subtract(end[0], start[0]), t));
  const y = add(start[1], multiply(subtract(end[1], start[1]), t));
  return pool.make(x.n * y.d, y.n * x.d, x.d * y.d);
}

function within(point: Point, value: Point, pool: PointPool): boolean {
  return contains(interval(point.value[0], pool), fraction(value.x, value.w))
    && contains(interval(point.value[1], pool), fraction(value.y, value.w));
}

/** Only verification coordinates change; one numeric identity has one witness. */
export function conversionWitnesses(authority: Ring[], pieces: Ring[], pool: PointPool): Ring[] {
  const unresolved = unresolvedEdges(authority, pieces), index = new BoxIndex(unresolved.edges);
  const points = new Map(pieces.flat().map(point => [point.key, point]));
  const pinned = new Set(authority.flat().map(point => point.key));
  const constraints = new Map<string, Constraint[]>();
  for (const point of points.values()) {
    if (!unresolved.points.has(point.key)) continue;
    const list: Constraint[] = [];
    let needsWitness = false;
    for (const edge of index.query(extent([[point]]))) {
      if (point.key === edge.a.key || point.key === edge.b.key) continue;
      if (onSegment(point, edge.a, edge.b)) { list.push({ edge, witness: point }); continue; }
      const candidate = witness(point, edge, pool);
      if (!candidate) continue;
      needsWitness = true;
      list.push({ edge, witness: candidate });
    }
    if (!needsWitness) continue;
    constraints.set(point.key, list);
    for (const { edge } of list) { pinned.add(edge.a.key); pinned.add(edge.b.key); }
  }
  const replacements = new Map<string, Point>();
  for (const [key, list] of constraints) {
    if (pinned.has(key)) throw invariantFailure('published fixed vertex conflicts with a conversion edge', {
      vertex: points.get(key)!.value,
      constraints: list.map(({ edge }) => [edge.a.value, edge.b.value]),
      fixedBy: [...constraints.values()].flat().filter(({ edge }) => edge.a.key === key || edge.b.key === key)
        .map(({ edge }) => [edge.a.value, edge.b.value]),
    });
    let candidate = list[0].witness;
    for (const { edge } of list.slice(1)) {
      if (onSegment(candidate, edge.a, edge.b)) continue;
      const first = list[0].edge;
      if (orient(first.a, first.b, edge.a) === 0n && orient(first.a, first.b, edge.b) === 0n) continue;
      try { candidate = intersection(first.a, first.b, edge.a, edge.b, pool); }
      catch { throw invariantFailure('published conversion edges have no common point'); }
      if (!within(points.get(key)!, candidate, pool)) throw invariantFailure('published conversion edges disagree');
    }
    if (list.some(({ edge }) => !onSegment(candidate, edge.a, edge.b))) throw invariantFailure('published conversion edges disagree');
    replacements.set(key, candidate);
  }
  const identities = new Set<string>();
  for (const point of points.values()) {
    const replacement = replacements.get(point.key) ?? point;
    if (identities.has(replacement.key)) throw invariantFailure('published conversion collapses distinct vertices');
    identities.add(replacement.key);
  }
  return pieces.map(ring => ring.map(point => replacements.get(point.key) ?? point));
}
