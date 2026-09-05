import type { StationInterval } from './schema';

/** Closed valid intervals minus open blocker intervals; tangencies remain valid. */
export function subtractIntervals(domain: StationInterval, blockers: StationInterval[]): StationInterval[] {
  const ordered = blockers.slice().sort((a, b) => a.from - b.from || a.to - b.to);
  const result: StationInterval[] = [];
  let cursor = domain.from;
  for (const blocker of ordered) {
    if (blocker.to <= cursor) continue;
    if (blocker.from >= domain.to) break;
    if (blocker.from >= cursor) result.push({ from: cursor, to: blocker.from });
    cursor = Math.max(cursor, blocker.to);
    if (cursor > domain.to) return result;
  }
  if (cursor <= domain.to) result.push({ from: cursor, to: domain.to });
  return result;
}
