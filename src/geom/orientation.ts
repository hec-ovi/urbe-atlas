import type { Polygon, Vec2 } from './schema';

interface BinaryNumber { significand: bigint; exponent: number }

const bits = new DataView(new ArrayBuffer(8));

/** Every finite double is one integer times a power of two. */
function binary(value: number): BinaryNumber {
  bits.setFloat64(0, value);
  const high = bits.getUint32(0), low = bits.getUint32(4);
  const exponent = (high >>> 20) & 0x7ff;
  let significand = (BigInt(high & 0xfffff) << 32n) | BigInt(low);
  if (exponent !== 0) significand |= 1n << 52n;
  if (high >>> 31) significand = -significand;
  return { significand, exponent: exponent === 0 ? -1074 : exponent - 1075 };
}

function exact(a: Vec2, b: Vec2, c: Vec2): number {
  const values = [...a, ...b, ...c].map(binary);
  const exponent = Math.min(...values.filter((value) => value.significand !== 0n).map((value) => value.exponent));
  const [ax, ay, bx, by, cx, cy] = values.map((value) => value.significand === 0n
    ? 0n : value.significand << BigInt(value.exponent - exponent));
  const determinant = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return determinant > 0n ? 1 : determinant < 0n ? -1 : 0;
}

/** Exact sign for the supplied doubles, with a bounded-error fast path. */
export function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  if ((a[0] === b[0] && a[1] === b[1]) || (a[0] === c[0] && a[1] === c[1]) || (b[0] === c[0] && b[1] === c[1])) return 0;
  const left = (a[0] - c[0]) * (b[1] - c[1]);
  const right = (a[1] - c[1]) * (b[0] - c[0]);
  const determinant = left - right;
  if (Math.abs(determinant) > 8 * Number.EPSILON * (Math.abs(left) + Math.abs(right))) return Math.sign(determinant);
  return exact(a, b, c);
}

/** A simple ring's lexicographically first corner is convex. */
export function winding(polygon: Polygon): number {
  let first = 0;
  for (let i = 1; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[first];
    if (p[0] < q[0] || (p[0] === q[0] && p[1] < q[1])) first = i;
  }
  return orientation(polygon[(first + polygon.length - 1) % polygon.length], polygon[first], polygon[(first + 1) % polygon.length]);
}
