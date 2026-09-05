import type { GridSegment } from './GridIntersections';
import type { GridPoint } from './schema';

interface Ratio { numerator: bigint; denominator: bigint }

function compare(a: Ratio, b: Ratio): number {
  const difference = a.numerator * b.denominator - b.numerator * a.denominator;
  return difference > 0n ? 1 : difference < 0n ? -1 : 0;
}

/** Lower cell faces are closed and upper faces open, matching nearest rounding. */
export function traversesGridCell(edge: GridSegment, point: GridPoint): boolean {
  let lo: Ratio = { numerator: 0n, denominator: 1n }, hi: Ratio = { numerator: 1n, denominator: 1n };
  let loIncluded = true, hiIncluded = true;
  for (const axis of ['x', 'y'] as const) {
    const delta = BigInt(edge.b[axis]) - BigInt(edge.a[axis]);
    if (delta === 0n) {
      if (edge.a[axis] !== point[axis]) return false;
      continue;
    }
    const lower = 2n * (BigInt(point[axis]) - BigInt(edge.a[axis])) - 1n;
    const upper = lower + 2n;
    const forward = delta > 0n;
    const denominator = 2n * (forward ? delta : -delta);
    const enter: Ratio = { numerator: forward ? lower : -upper, denominator };
    const leave: Ratio = { numerator: forward ? upper : -lower, denominator };
    const loOrder = compare(enter, lo), hiOrder = compare(leave, hi);
    if (loOrder > 0) { lo = enter; loIncluded = forward; }
    else if (loOrder === 0) loIncluded &&= forward;
    if (hiOrder < 0) { hi = leave; hiIncluded = !forward; }
    else if (hiOrder === 0) hiIncluded &&= !forward;
    const interval = compare(lo, hi);
    if (interval > 0 || (interval === 0 && !(loIncluded && hiIncluded))) return false;
  }
  return true;
}
