import { invariantFailure } from '../../errors';
import type { ExactVertex, PartitionEncoding, Polygon, Vec2 } from './schema';
import { numericCoordinate } from './NumericCoordinate';

export interface Point { x: bigint; y: bigint; w: bigint; key: string; value: Vec2 }
export type Ring = Point[];
export type Region = Ring[];
export interface Direction { x: bigint; y: bigint }
export interface Probe { base: Point; direction: Direction }

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a; b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

const buffer = new DataView(new ArrayBuffer(8));
function binary(value: number): [bigint, bigint] {
  if (!Number.isFinite(value)) throw invariantFailure('partition coordinates must be finite');
  if (value === 0) return [0n, 1n];
  buffer.setFloat64(0, value);
  const bits = buffer.getBigUint64(0), exponent = Number((bits >> 52n) & 2047n);
  const mantissa = (bits & ((1n << 52n) - 1n)) | (exponent ? 1n << 52n : 0n);
  const power = (exponent || 1) - 1075;
  const signed = bits >> 63n ? -mantissa : mantissa;
  return power >= 0 ? [signed << BigInt(power), 1n] : [signed, 1n << BigInt(-power)];
}

export class PointPool {
  private readonly points: Map<string, Point>;

  constructor(private readonly coordinateScale?: 1000, points?: Map<string, Point>) {
    if (coordinateScale !== undefined && coordinateScale !== 1000) throw invariantFailure('partition coordinate scale must be 1000');
    this.points = points ?? new Map();
  }

  reader(encoding?: PartitionEncoding): PointPool {
    if (encoding === undefined) return this;
    if (encoding === 'authored-1mm') return new PointPool(1000, this.points);
    if (encoding === 'binary') return new PointPool(undefined, this.points);
    throw invariantFailure('partition coordinate encoding is unknown');
  }

  make(x: bigint, y: bigint, w: bigint, original?: Vec2): Point {
    if (!w) throw invariantFailure('partition intersection is not finite');
    if (w < 0n) { x = -x; y = -y; w = -w; }
    const divisor = gcd(gcd(x, y), w);
    x /= divisor; y /= divisor; w /= divisor;
    const key = `${x},${y},${w}`;
    const existing = this.points.get(key);
    if (existing) return existing;
    const value: Vec2 = original ? [...original] : [numericCoordinate(x, w), numericCoordinate(y, w)];
    if (!value.every(Number.isFinite)) throw invariantFailure('partition coordinate cannot be represented');
    const point = { x, y, w, key, value };
    this.points.set(key, point);
    return point;
  }

  input(value: Vec2): Point {
    const scale = this.coordinateScale;
    if (scale !== undefined) {
      const scaled = value.map(coordinate => Math.round(coordinate * scale));
      if (scaled.some((coordinate, index) => !Number.isSafeInteger(coordinate) || coordinate / scale !== value[index])) {
        throw invariantFailure('partition declared lattice input is off-grid');
      }
      return this.make(BigInt(scaled[0]), BigInt(scaled[1]), BigInt(scale), value);
    }
    const [x, xd] = binary(value[0]), [y, yd] = binary(value[1]);
    const w = xd > yd ? xd : yd;
    return this.make(x * (w / xd), y * (w / yd), w, value);
  }

  restore(value: ExactVertex): Point {
    try { return this.make(BigInt(value.x), BigInt(value.y), BigInt(value.w)); }
    catch { throw invariantFailure('partition certificate contains an invalid exact vertex'); }
  }

  affine(from: Point, to: Point, t: number): Point {
    const [numerator, denominator] = binary(t);
    if (t === 0 || from.key === to.key) return from;
    if (t === 1) return to;
    const rest = denominator - numerator;
    return this.make(from.x * to.w * rest + to.x * from.w * numerator,
      from.y * to.w * rest + to.y * from.w * numerator, from.w * to.w * denominator);
  }

  ring(polygon: Polygon): Ring {
    return normalizeRing(polygon.map(point => this.input(point)));
  }
}

export function normalizeRing(ring: Ring): Ring {
  const points = ring.filter((point, index) => !index || point.key !== ring[index - 1].key);
  if (points.length > 1 && points[0].key === points[points.length - 1].key) points.pop();
  const winding = points.length < 3 ? 0 : ringSign(points);
  if (!winding) throw invariantFailure('partition ring must have positive area');
  return winding > 0 ? points : points.reverse();
}

export const sign = (value: bigint): number => value < 0n ? -1 : value > 0n ? 1 : 0;
function filteredCompare(a: Point, b: Point, axis: 0 | 1): number | undefined {
  const difference = a.value[axis] - b.value[axis];
  const error = 16 * Number.EPSILON * Math.max(1, Math.abs(a.value[axis]), Math.abs(b.value[axis]));
  return Math.abs(difference) > error ? Math.sign(difference) : undefined;
}
export const compareX = (a: Point, b: Point): number => filteredCompare(a, b, 0) ?? sign(a.x * b.w - b.x * a.w);
export const compareY = (a: Point, b: Point): number => filteredCompare(a, b, 1) ?? sign(a.y * b.w - b.y * a.w);
export const compare = (a: Point, b: Point): number => compareX(a, b) || compareY(a, b);
export const vector = (a: Point, b: Point): Direction => ({ x: b.x * a.w - a.x * b.w, y: b.y * a.w - a.y * b.w });
export const cross = (a: Direction, b: Direction): bigint => a.x * b.y - a.y * b.x;
/** Exact orientation sign; magnitude is intentionally unspecified. */
export function orient(a: Point, b: Point, c: Point): bigint {
  const dx1 = b.value[0] - a.value[0], dy1 = b.value[1] - a.value[1];
  const dx2 = c.value[0] - a.value[0], dy2 = c.value[1] - a.value[1];
  const first = dx1 * dy2, second = dy1 * dx2, determinant = first - second;
  const coordinateError = 16 * Number.EPSILON * Math.max(1, Math.abs(a.value[0]), Math.abs(a.value[1]),
    Math.abs(b.value[0]), Math.abs(b.value[1]), Math.abs(c.value[0]), Math.abs(c.value[1]));
  const error = coordinateError * (Math.abs(dx1) + Math.abs(dy1) + Math.abs(dx2) + Math.abs(dy2))
    + 4 * coordinateError ** 2 + 8 * Number.EPSILON * (Math.abs(first) + Math.abs(second));
  if (Math.abs(determinant) > error) return determinant > 0 ? 1n : -1n;
  return (b.x * a.w - a.x * b.w) * (c.y * a.w - a.y * c.w)
    - (b.y * a.w - a.y * b.w) * (c.x * a.w - a.x * c.w);
}

export function onSegment(point: Point, a: Point, b: Point): boolean {
  return orient(a, b, point) === 0n && compareX(point, a) * compareX(point, b) <= 0
    && compareY(point, a) * compareY(point, b) <= 0;
}

export function intersection(a: Point, b: Point, c: Point, d: Point, pool: PointPool): Point {
  const line = (p: Point, q: Point) => ({ x: p.y * q.w - p.w * q.y, y: p.w * q.x - p.x * q.w, w: p.x * q.y - p.y * q.x });
  const p = line(a, b), q = line(c, d);
  return pool.make(p.y * q.w - p.w * q.y, p.w * q.x - p.x * q.w, p.x * q.y - p.y * q.x);
}

export function leftProbe(a: Point, b: Point, pool: PointPool): Probe {
  const direction = vector(a, b);
  return { base: pool.make(a.x * b.w + b.x * a.w, a.y * b.w + b.y * a.w, 2n * a.w * b.w),
    direction: { x: -direction.y, y: direction.x } };
}

export function winding(rings: Region, probe: Probe): number {
  let count = 0;
  for (const ring of rings) for (let index = 0; index < ring.length; index++) {
    const a = ring[index], b = ring[(index + 1) % ring.length];
    const ay = compareY(a, probe.base) || -sign(probe.direction.y);
    const by = compareY(b, probe.base) || -sign(probe.direction.y);
    if ((ay <= 0 && by > 0) || (by <= 0 && ay > 0)) {
      const side = sign(orient(a, b, probe.base)) || sign(cross(vector(a, b), probe.direction));
      if (ay <= 0 && by > 0 && side > 0) count++;
      if (by <= 0 && ay > 0 && side < 0) count--;
    }
  }
  return count;
}

export function ringSign(ring: Ring): number {
  let first = 0;
  for (let index = 1; index < ring.length; index++) if (compare(ring[index], ring[first]) < 0) first = index;
  for (let distance = 1; distance < ring.length; distance++) {
    const turn = sign(orient(ring[(first + ring.length - distance) % ring.length], ring[first], ring[(first + 1) % ring.length]));
    if (turn) return turn;
  }
  return 0;
}
