import type { Polyline, Vec2 } from '../../schema/blueprint';
import { simplify } from '../geom/polyline';

const pointKey = (point: Vec2): string => `${point[0]},${point[1]}`;

/** Simplify between authored joins, retaining every shared source endpoint. */
export function simplifyJoinedPaths(paths: Polyline[], tolerance: number): Polyline[] {
  if (tolerance === 0) return paths;
  const endpoints = new Set(paths.flatMap((path) => [pointKey(path[0]), pointKey(path[path.length - 1])]));
  return paths.map((path) => {
    const result: Polyline = [path[0]];
    let start = 0;
    for (let i = 1; i < path.length; i++) {
      if (!endpoints.has(pointKey(path[i]))) continue;
      result.push(...simplify(path.slice(start, i + 1), tolerance).slice(1));
      start = i;
    }
    return result;
  });
}
