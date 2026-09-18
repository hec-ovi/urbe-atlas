import type { GridPath, GridPoint } from './schema';

export interface GridSegment { a: GridPoint; b: GridPoint }

const same = (a: GridPoint, b: GridPoint): boolean => a.x === b.x && a.y === b.y;

/** One value per distinct grid point, for the maps that dedupe vertices and cells. */
export type PointKey = number | string;

/** Beyond this the packed key would stop being an exact integer, so the string form takes over. */
const PACKED_LIMIT = 33554432; // 2 ** 25 grid units
const PACKED_STRIDE = 67108864; // 2 ** 26

export const pointKey = (p: GridPoint): PointKey => (
  p.x > -PACKED_LIMIT && p.x < PACKED_LIMIT && p.y > -PACKED_LIMIT && p.y < PACKED_LIMIT
    ? p.x * PACKED_STRIDE + p.y
    : `${p.x},${p.y}`
);

function determinant(a: GridPoint, b: GridPoint, c: GridPoint): bigint {
  return (BigInt(b.x) - BigInt(a.x)) * (BigInt(c.y) - BigInt(a.y))
    - (BigInt(b.y) - BigInt(a.y)) * (BigInt(c.x) - BigInt(a.x));
}

function orientation(a: GridPoint, b: GridPoint, c: GridPoint): number {
  const p = (b.x - a.x) * (c.y - a.y);
  const q = (b.y - a.y) * (c.x - a.x);
  if (Number.isSafeInteger(p) && Number.isSafeInteger(q) && Number.isSafeInteger(p - q)) return Math.sign(p - q);
  const d = determinant(a, b, c);
  return d > 0n ? 1 : d < 0n ? -1 : 0;
}

/** Exact vertex contact in the interior of an integer-grid segment. */
export function interiorContact(point: GridPoint, a: GridPoint, b: GridPoint): boolean {
  if (same(point, a) || same(point, b)) return false;
  if (a.x < b.x ? point.x < a.x || point.x > b.x : point.x < b.x || point.x > a.x) return false;
  if (a.y < b.y ? point.y < a.y || point.y > b.y : point.y < b.y || point.y > a.y) return false;
  return orientation(a, b, point) === 0;
}

/** Nearest integer; an exact half goes toward positive infinity like snap(). */
function nearest(numerator: bigint, denominator: bigint): number {
  if (denominator < 0n) return nearest(-numerator, -denominator);
  const remainder = ((numerator % denominator) + denominator) % denominator;
  const floor = (numerator - remainder) / denominator;
  return Number(floor + (remainder * 2n >= denominator ? 1n : 0n));
}

/** Both coordinates come from exact integer ratios, independent of edge order. */
function crossing(a: GridSegment, b: GridSegment): GridPoint {
  const ax = BigInt(a.a.x), ay = BigInt(a.a.y);
  const dx = BigInt(a.b.x) - ax, dy = BigInt(a.b.y) - ay;
  const bx = BigInt(b.a.x), by = BigInt(b.a.y);
  const ex = BigInt(b.b.x) - bx, ey = BigInt(b.b.y) - by;
  const denominator = dx * ey - dy * ex;
  const t = (bx - ax) * ey - (by - ay) * ex;
  return { x: nearest(ax * denominator + dx * t, denominator), y: nearest(ay * denominator + dy * t, denominator) };
}

export function segments(paths: GridPath[]): GridSegment[] {
  const out: GridSegment[] = [];
  for (const path of paths) {
    for (let i = 0; i < path.length; i++) {
      const a = path[i];
      const b = path[i + 1 === path.length ? 0 : i + 1];
      if (!same(a, b)) out.push({ a, b });
    }
  }
  return out;
}

/**
 * X sweep rejects unrelated edges before exact orientation predicates. Bounds live in
 * parallel arrays and the active list compacts in place, so a sweep allocates nothing
 * per edge; the sort runs over indices and stays stable, matching the edge order.
 */
export function crossingCells(edges: GridSegment[]): GridPoint[] {
  const count = edges.length;
  const minX = new Float64Array(count), maxX = new Float64Array(count);
  const minY = new Float64Array(count), maxY = new Float64Array(count);
  const order = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const { a, b } = edges[i];
    minX[i] = a.x < b.x ? a.x : b.x; maxX[i] = a.x < b.x ? b.x : a.x;
    minY[i] = a.y < b.y ? a.y : b.y; maxY[i] = a.y < b.y ? b.y : a.y;
    order[i] = i;
  }
  order.sort((p, q) => minX[p] - minX[q] || minY[p] - minY[q] || maxX[p] - maxX[q] || maxY[p] - maxY[q]);

  const cells = new Map<PointKey, GridPoint>();
  const active = new Array<number>(count);
  let live = 0;
  for (const i of order) {
    let kept = 0;
    for (let s = 0; s < live; s++) {
      const j = active[s];
      if (maxX[j] >= minX[i]) active[kept++] = j;
    }
    live = kept;
    const edge = edges[i];
    for (let s = 0; s < live; s++) {
      const j = active[s];
      if (maxY[j] < minY[i] || minY[j] > maxY[i]) continue;
      const other = edges[j];
      if (orientation(edge.a, edge.b, other.a) * orientation(edge.a, edge.b, other.b) >= 0
        || orientation(other.a, other.b, edge.a) * orientation(other.a, other.b, edge.b) >= 0) continue;
      const cell = crossing(edge, other);
      cells.set(pointKey(cell), cell);
    }
    active[live++] = i;
  }
  return [...cells.values()];
}
