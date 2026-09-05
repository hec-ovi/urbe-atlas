export interface Fraction { n: bigint; d: bigint }

export const fraction = (n: bigint, d = 1n): Fraction => d < 0n ? { n: -n, d: -d } : { n, d };
export const compare = (a: Fraction, b: Fraction): number => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
export const add = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
export const subtract = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
export const multiply = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.n, a.d * b.d);
export const divide = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.d, a.d * b.n);
export const midpoint = (a: Fraction, b: Fraction): Fraction => divide(add(a, b), fraction(2n));
