import { invariantFailure } from '../errors';
import { crossingCells, pointKey, segments, type GridSegment } from './GridIntersections';
import { GridCellIndex } from './GridCellIndex';
import { nodeGridContacts } from './GridContacts';
import { traversesGridCell } from './GridCellTraversal';
import { simpleCycles } from './SimpleCycles';
import type { GridPath } from './schema';

/** Shared directed or reversed edges receive exactly the same grid route. */
function route(edge: GridSegment, cells: GridCellIndex): GridPath {
  const reverse = edge.a.x > edge.b.x || (edge.a.x === edge.b.x && edge.a.y > edge.b.y);
  const a = reverse ? edge.b : edge.a, b = reverse ? edge.a : edge.b;
  const dx = b.x - a.x, dy = b.y - a.y;
  const points = cells.near(a, b).filter((p) => traversesGridCell({ a, b }, p));
  points.sort((p, q) => (p.x - q.x) * dx + (p.y - q.y) * dy || p.x - q.x || p.y - q.y);
  return reverse ? points.reverse() : points;
}

/** Resolve snapped crossings while keeping every published vertex on the grid. */
export function normalizePaths(paths: GridPath[]): GridPath[] {
  paths = nodeGridContacts(paths.flatMap(simpleCycles));
  const crossings = crossingCells(segments(paths));
  if (crossings.length === 0) return paths;
  const cells = new Map(paths.flat().map((p) => [pointKey(p), p]));
  for (const cell of crossings) cells.set(pointKey(cell), cell);
  const points = new GridCellIndex([...cells.values()]);
  const routed = paths.map((path) => path.flatMap((a, i) => {
    const b = path[(i + 1) % path.length];
    return pointKey(a) === pointKey(b) ? [] : route({ a, b }, points).slice(0, -1);
  }));
  const result = nodeGridContacts(routed.flatMap(simpleCycles));
  const remaining = crossingCells(segments(result));
  if (remaining.length > 0) {
    throw invariantFailure('polygon snap-rounding has an unresolved grid-cell crossing', { paths: result, crossings: remaining });
  }
  return result;
}
