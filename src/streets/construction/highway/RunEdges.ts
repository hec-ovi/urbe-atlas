import { invariantFailure } from '../../../errors';
import { length as pathLength, pointAt } from '../../../geom/polyline';
import { dist } from '../../../geom/vec';
import type { ClassedEdge, HighwayEnvelope } from './schema';

/** Maps ordered run stations back to each source edge's direction. */
export function* runEdges<T extends ClassedEdge>(
  envelope: HighwayEnvelope,
  byId: ReadonlyMap<string, T>,
): Generator<{ edge: T; start: number; end: number; length: number; forward: boolean }> {
  let start = -(envelope.approaches?.start ?? 0);
  let position = envelope.path[0];
  for (const edgeId of envelope.edgeIds) {
    const edge = byId.get(edgeId);
    if (!edge || edge.path.length < 2) {
      throw invariantFailure(`highway run has no path for edge ${edgeId}`);
    }
    const length = pathLength(edge.path);
    const inset = start < 0 ? -start : 0;
    const forward = dist(pointAt(edge.path, inset), position) <= 0.002;
    const backward = dist(pointAt(edge.path, length - inset), position) <= 0.002;
    if (!forward && !backward) {
      throw invariantFailure(`highway run loses edge ${edge.id} at ${position.join(',')}`);
    }
    const end = start + length;
    yield { edge, start, end, length, forward };
    start = end;
    position = forward ? edge.path[edge.path.length - 1] : edge.path[0];
  }
}
