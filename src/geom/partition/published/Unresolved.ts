import type { Ring } from '../Exact';
import { segments, type Segment } from '../Segments';

interface Entry { edge: Segment; owner: number; direction: number }
interface Incidence { domain: Entry[]; pieces: Entry[] }

/** Shared numeric incidence is authoritative before any conversion inference. */
export function unresolvedEdges(domain: Ring[], pieces: Ring[]): { edges: Segment[]; points: Set<string> } {
  const incidence = new Map<string, Incidence>();
  for (const [owner, ring] of [...domain, ...pieces].entries()) for (const edge of segments([ring])) {
    const direction = edge.a.key < edge.b.key ? 1 : -1;
    const key = direction > 0 ? `${edge.a.key}|${edge.b.key}` : `${edge.b.key}|${edge.a.key}`;
    let entry = incidence.get(key);
    if (!entry) incidence.set(key, entry = { domain: [], pieces: [] });
    (owner < domain.length ? entry.domain : entry.pieces).push({ edge, owner, direction });
  }
  const edges: Segment[] = [], points = new Set<string>();
  for (const entry of incidence.values()) {
    const [first, second] = entry.pieces;
    const shared = !entry.domain.length && entry.pieces.length === 2
      && first.owner !== second.owner && first.direction !== second.direction;
    const boundary = entry.domain.length === 1 && entry.pieces.length === 1
      && entry.domain[0].direction === first.direction;
    if (shared || boundary) continue;
    edges.push(...entry.domain.map(value => value.edge), ...entry.pieces.map(value => value.edge));
    for (const { edge } of entry.pieces) { points.add(edge.a.key); points.add(edge.b.key); }
  }
  return { edges, points };
}
