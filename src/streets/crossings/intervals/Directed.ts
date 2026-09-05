import { invariantFailure } from '../../../errors';

export type Range = readonly [number, number];
type Operation = 'add' | 'subtract' | 'multiply' | 'divide';
interface Fraction { numerator: bigint; denominator: bigint }
const view = new DataView(new ArrayBuffer(8));

/** Tight outward bounds for arithmetic on the supplied binary numbers. */
export class Directed {
  static point(value: number): Range { return [value, value]; }

  static add(a: Range, b: Range): Range {
    return [rounded('add', a[0], b[0])[0], rounded('add', a[1], b[1])[1]];
  }

  static subtract(a: Range, b: Range): Range {
    return [rounded('subtract', a[0], b[1])[0], rounded('subtract', a[1], b[0])[1]];
  }

  static multiply(a: Range, b: Range): Range { return corners('multiply', a, b); }

  static divide(a: Range, b: Range): Range {
    if (b[0] <= 0 && b[1] >= 0) throw invariantFailure('crossing station division contains zero');
    return corners('divide', a, b);
  }
}

function corners(operation: Operation, a: Range, b: Range): Range {
  const values = [rounded(operation, a[0], b[0]), rounded(operation, a[0], b[1]),
    rounded(operation, a[1], b[0]), rounded(operation, a[1], b[1])];
  return [Math.min(...values.map(value => value[0])), Math.max(...values.map(value => value[1]))];
}

function rounded(operation: Operation, a: number, b: number): Range {
  const left = fraction(a), right = fraction(b);
  let value: number, numerator: bigint, denominator: bigint;
  switch (operation) {
    case 'add':
      value = a + b;
      numerator = left.numerator * right.denominator + right.numerator * left.denominator;
      denominator = left.denominator * right.denominator;
      break;
    case 'subtract':
      value = a - b;
      numerator = left.numerator * right.denominator - right.numerator * left.denominator;
      denominator = left.denominator * right.denominator;
      break;
    case 'multiply':
      value = a * b;
      numerator = left.numerator * right.numerator;
      denominator = left.denominator * right.denominator;
      break;
    case 'divide':
      value = a / b;
      numerator = left.numerator * right.denominator;
      denominator = left.denominator * right.numerator;
      if (denominator < 0) { numerator = -numerator; denominator = -denominator; }
      break;
  }
  if (!Number.isFinite(value) || denominator === 0n) throw invariantFailure('crossing station arithmetic is not finite');
  const result = fraction(value);
  const difference = result.numerator * denominator - numerator * result.denominator;
  if (difference === 0n) return [value, value];
  return difference < 0n ? [value, adjacent(value, 1)] : [adjacent(value, -1), value];
}

function fraction(value: number): Fraction {
  if (!Number.isFinite(value)) throw invariantFailure('crossing station arithmetic requires finite inputs');
  if (value === 0) return { numerator: 0n, denominator: 1n };
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const encodedExponent = Number((bits >> 52n) & 2047n);
  let numerator = bits & ((1n << 52n) - 1n);
  const exponent = encodedExponent === 0 ? -1074 : encodedExponent - 1023 - 52;
  if (encodedExponent !== 0) numerator |= 1n << 52n;
  if (bits >> 63n) numerator = -numerator;
  return exponent >= 0 ? { numerator: numerator << BigInt(exponent), denominator: 1n }
    : { numerator, denominator: 1n << BigInt(-exponent) };
}

function adjacent(value: number, direction: -1 | 1): number {
  if (value === 0) return direction * Number.MIN_VALUE;
  view.setFloat64(0, value);
  const increase = (value > 0) === (direction > 0);
  view.setBigUint64(0, view.getBigUint64(0) + (increase ? 1n : -1n));
  return view.getFloat64(0);
}
