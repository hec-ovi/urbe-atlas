import { invariantFailure } from '../../errors';
import { compare, type Point, type PointPool, type Region, type Ring } from './Exact';
import { chain, nodeSegments, segments } from './Segments';
import { numericRing } from './NumericRing';

interface Edge { a: Point; b: Point }
interface Group { id: number; parent: Group; edges: Map<string, Edge>; numeric: boolean }
const key = (a: Point, b: Point) => compare(a, b) < 0 ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;

function root(group: Group): Group {
  if (group.parent !== group) group.parent = root(group.parent);
  return group.parent;
}

function loop(edges: Map<string, Edge>): Ring | undefined {
  const outgoing = new Map<string, Edge>();
  for (const edge of edges.values()) {
    if (outgoing.has(edge.a.key)) return;
    outgoing.set(edge.a.key, edge);
  }
  const first = edges.values().next().value as Edge | undefined;
  if (!first) return;
  const ring: Ring = [], visited = new Set<string>();
  let edge: Edge | undefined = first;
  while (edge && !visited.has(edge.a.key)) {
    visited.add(edge.a.key); ring.push(edge.a); edge = outgoing.get(edge.b.key);
  }
  return edge?.a.key === first.a.key && visited.size === edges.size ? ring : undefined;
}

/** Adjacent faces merge only when their exact union has one simple boundary. */
export function coalesce(triangles: Region, pool: PointPool, boundary: Region): Region {
  const allEdges = segments([...triangles, ...boundary]);
  nodeSegments(allEdges, pool);
  const incidence = new Map<string, Group[]>(), groups: Group[] = [];
  let cursor = 0;
  for (let id = 0; id < triangles.length; id++) {
    const group = { id, edges: new Map<string, Edge>() } as Group; group.parent = group; groups.push(group);
    for (let side = 0; side < triangles[id].length; side++) {
      const points = chain(allEdges[cursor++]);
      for (let step = 1; step < points.length; step++) {
        const a = points[step - 1], b = points[step], edgeKey = key(a, b);
        group.edges.set(edgeKey, { a, b });
        let adjacent = incidence.get(edgeKey);
        if (!adjacent) incidence.set(edgeKey, adjacent = []);
        adjacent.push(group);
      }
    }
    group.numeric = numericRing(loop(group.edges)!);
  }
  let candidates = [...incidence.values()].filter(adjacent => adjacent.length === 2);
  while (candidates.length) {
    candidates.sort((a, b) => Number(root(a[0]).numeric && root(a[1]).numeric) - Number(root(b[0]).numeric && root(b[1]).numeric));
    const pending: Group[][] = [];
    let changed = false;
    for (const pair of candidates) {
      let a = root(pair[0]), b = root(pair[1]);
      if (a === b) continue;
      if (a.id > b.id) [a, b] = [b, a];
      const joined = new Map(a.edges);
      for (const [edgeKey, edge] of b.edges) {
        const shared = joined.get(edgeKey);
        if (!shared) joined.set(edgeKey, edge);
        else {
          if (shared.a.key !== edge.b.key) throw invariantFailure('partition triangulation overlaps before coalescing');
          joined.delete(edgeKey);
        }
      }
      const ring = loop(joined);
      if (!ring) { pending.push(pair); continue; }
      const numeric = a.numeric && b.numeric || numericRing(ring);
      if (!numeric) { pending.push(pair); continue; }
      a.edges = joined; a.numeric = numeric; b.parent = a; b.edges = new Map(); changed = true;
    }
    if (!changed) break;
    candidates = pending;
  }
  return groups.filter(group => group.parent === group).map(group => loop(group.edges)!);
}
