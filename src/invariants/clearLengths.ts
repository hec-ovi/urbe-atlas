/**
 * Street construction closes a run with 8, 4 and 2 m pieces, so the clear
 * street between two junction boxes is a whole number of 2 m units. An
 * approach field is the box boundary on its arm; an end with no box leaves the
 * edge's own end there, so a street with no box at either end is on the grid
 * only when its own length is. Those few are published as degraded corridors.
 */
import type { CityBlueprint, StreetEdge, Vec2 } from '../../schema/blueprint';
import type { JunctionApproach } from '../streets/crossings/schema';
import { invariantFailure } from '../errors';

/** Shortest piece street construction lays, meters. */
const UNIT = 2;

/** Streets whose clear length is not a whole number of units. */
export function offGridStreets(edges: readonly StreetEdge[], approaches: readonly JunctionApproach[]): { edgeId: string; clear: number }[] {
  const off: { edgeId: string; clear: number }[] = [];
  for (const edge of edges) {
    if (edge.class === 'highway') continue;
    const first = edge.path[0], last = edge.path[edge.path.length - 1];
    const length = Math.hypot(last[0] - first[0], last[1] - first[1]);
    const direction: Vec2 = [(last[0] - first[0]) / length, (last[1] - first[1]) / length];
    const along = (point: Vec2): number => (point[0] - first[0]) * direction[0] + (point[1] - first[1]) * direction[1];
    const boundaries = (nodeId: string): number[] => approaches
      .filter(approach => approach.edgeId === edge.id && approach.nodeId === nodeId)
      .flatMap(approach => approach.field.map(along));
    const clear = Math.min(length, ...boundaries(edge.to)) - Math.max(0, ...boundaries(edge.from));
    if (clear < 0 || Math.abs(clear - Math.round(clear / UNIT) * UNIT) > 1e-6) off.push({ edgeId: edge.id, clear });
  }
  return off;
}

/** Every street is on the grid, or the report says which one is not. */
export function checkClearLengths(bp: CityBlueprint): void {
  const approaches = (bp.streets.construction?.junctions ?? []).flatMap(junction => junction.approaches);
  const declared = new Set((bp.report?.degraded ?? []).filter(entry => entry.kind === 'corridor').map(entry => entry.id));
  for (const { edgeId, clear } of offGridStreets(bp.streets.edges, approaches)) {
    if (declared.has(edgeId)) continue;
    throw invariantFailure(`edge ${edgeId} leaves a ${clear.toFixed(3)} m clear street, off the ${UNIT} m grid`, { edgeId, clear });
  }
}
