import type { GridPath, GridPoint } from './schema';

export interface GridSegment { a: GridPoint; b: GridPoint }

const same = (a: GridPoint, b: GridPoint): boolean => a.x === b.x && a.y === b.y;
export const pointKey = (p: GridPoint): string => `${p.x},${p.y}`;

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
export function interiorContact(point: GridPoint, edge: GridSegment): boolean {
  return !same(point, edge.a) && !same(point, edge.b)
    && point.x >= Math.min(edge.a.x, edge.b.x) && point.x <= Math.max(edge.a.x, edge.b.x)
    && point.y >= Math.min(edge.a.y, edge.b.y) && point.y <= Math.max(edge.a.y, edge.b.y)
    && orientation(edge.a, edge.b, point) === 0;
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
  return paths.flatMap((path) => path.flatMap((a, i) => {
    const b = path[(i + 1) % path.length];
    return same(a, b) ? [] : [{ a, b }];
  }));
}

/** X sweep rejects unrelated edges before exact orientation predicates. */
export function crossingCells(edges: GridSegment[]): GridPoint[] {
  const ordered = edges.map((edge) => ({
    ...edge,
    minX: Math.min(edge.a.x, edge.b.x), maxX: Math.max(edge.a.x, edge.b.x),
    minY: Math.min(edge.a.y, edge.b.y), maxY: Math.max(edge.a.y, edge.b.y),
  })).sort((a, b) => a.minX - b.minX || a.minY - b.minY || a.maxX - b.maxX || a.maxY - b.maxY);
  const cells = new Map<string, GridPoint>();
  let active: typeof ordered = [];
  for (const edge of ordered) {
    active = active.filter((other) => other.maxX >= edge.minX);
    for (const other of active) {
      if (other.maxY < edge.minY || other.minY > edge.maxY) continue;
      if (orientation(edge.a, edge.b, other.a) * orientation(edge.a, edge.b, other.b) >= 0
        || orientation(other.a, other.b, edge.a) * orientation(other.a, other.b, edge.b) >= 0) continue;
      const cell = crossing(edge, other);
      cells.set(pointKey(cell), cell);
    }
    active.push(edge);
  }
  return [...cells.values()];
}
