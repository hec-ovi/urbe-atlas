import type { Vec2 } from '../../../../schema/blueprint';
import type { ClassedEdge, HighwayRun } from './schema';

/** Maximal chains end at a highway terminus or fork; rings remain closed. */
export function highwayRuns(edges: readonly ClassedEdge[]): HighwayRun[] {
  const highways = edges.filter((edge) => edge.class === 'highway');
  const at = new Map<string, string[]>();
  for (const edge of highways) {
    for (const node of [edge.from, edge.to]) {
      const list = at.get(node);
      if (list) list.push(edge.id);
      else at.set(node, [edge.id]);
    }
  }
  const byId = new Map(highways.map((edge) => [edge.id, edge]));
  const used = new Set<string>();
  const onward = (node: string, from: string): string | undefined => {
    const here = (at.get(node) ?? []).filter((id) => id !== from);
    return here.length === 1 && !used.has(here[0]) ? here[0] : undefined;
  };
  const chainFrom = (node: string, first: string | undefined): { ids: string[]; end: string } => {
    const ids: string[] = [];
    let end = node;
    let id = first;
    while (id) {
      used.add(id);
      ids.push(id);
      const edge = byId.get(id)!;
      end = edge.from === end ? edge.to : edge.from;
      id = onward(end, id);
    }
    return { ids, end };
  };

  const runs: HighwayRun[] = [];
  for (const seed of highways) {
    if (used.has(seed.id)) continue;
    used.add(seed.id);
    const ahead = chainFrom(seed.to, onward(seed.to, seed.id));
    const behind = chainFrom(seed.from, onward(seed.from, seed.id));
    const ids = [...behind.ids.reverse(), seed.id, ...ahead.ids];
    const path: Vec2[] = [];
    let node = behind.end;
    for (const id of ids) {
      const edge = byId.get(id)!;
      const forward = edge.from === node;
      for (const point of forward ? edge.path : [...edge.path].reverse()) {
        const last = path[path.length - 1];
        if (!last || last[0] !== point[0] || last[1] !== point[1]) path.push(point);
      }
      node = forward ? edge.to : edge.from;
    }
    if (path.length < 2) continue;
    const ring = behind.end === ahead.end;
    runs.push({
      edgeIds: ids,
      path,
      rampAtStart: !ring && (at.get(behind.end) ?? []).length === 1,
      rampAtEnd: !ring && (at.get(ahead.end) ?? []).length === 1,
    });
  }
  return runs;
}
