import type { GridPath } from './schema';
import { pointKey, type PointKey } from './GridIntersections';

/**
 * Every repeated vertex closes a cycle; reciprocal edges have no area.
 * Distinct vertices mean the closing wrap is the only cycle, so the ring is returned as it came.
 */
export function simpleCycles(path: GridPath): GridPath[] {
  if (path.length < 3) return [];
  const seen = new Set<PointKey>();
  for (const point of path) {
    const key = pointKey(point);
    if (seen.has(key)) return splitCycles(path);
    seen.add(key);
  }
  return [path];
}

function splitCycles(path: GridPath): GridPath[] {
  const cycles: GridPath[] = [];
  const stack: GridPath = [];
  const positions = new Map<PointKey, number>();
  for (let i = 0; i <= path.length; i++) {
    const point = path[i === path.length ? 0 : i];
    const key = pointKey(point);
    const index = positions.get(key);
    if (index === undefined) {
      positions.set(key, stack.length);
      stack.push(point);
      continue;
    }
    if (stack.length - index >= 3) cycles.push(stack.slice(index));
    for (let j = index + 1; j < stack.length; j++) positions.delete(pointKey(stack[j]));
    stack.length = index + 1;
  }
  return cycles;
}
