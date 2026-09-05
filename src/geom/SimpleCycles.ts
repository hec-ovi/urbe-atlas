import type { GridPath } from './schema';
import { pointKey } from './GridIntersections';

/** Every repeated vertex closes a cycle; reciprocal edges have no area. */
export function simpleCycles(path: GridPath): GridPath[] {
  if (path.length < 3) return [];
  const cycles: GridPath[] = [];
  const stack: GridPath = [];
  const positions = new Map<string, number>();
  for (const point of [...path, path[0]]) {
    const key = pointKey(point);
    const index = positions.get(key);
    if (index === undefined) {
      positions.set(key, stack.length);
      stack.push(point);
      continue;
    }
    if (stack.length - index >= 3) cycles.push(stack.slice(index));
    for (let i = index + 1; i < stack.length; i++) positions.delete(pointKey(stack[i]));
    stack.length = index + 1;
  }
  return cycles;
}
