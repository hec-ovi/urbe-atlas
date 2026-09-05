import type { StationInterval } from './intervals/schema';

export function intersectRanges(a: StationInterval[], b: StationInterval[]): StationInterval[] {
  const result: StationInterval[] = [];
  for (const left of a) for (const right of b) {
    const from = Math.max(left.from, right.from), to = Math.min(left.to, right.to);
    if (from <= to) result.push({ from, to });
  }
  return result;
}
