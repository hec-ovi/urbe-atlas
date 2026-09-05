import type { BuiltEdge, BuiltNode } from '../Graph';
import type { Vec2 } from '../../../schema/blueprint';
import type { StreetRun } from './schema/sections';
import { length as pathLength } from '../../geom/polyline';

/** A through street continues across a junction without a turn sharper than this. */
const MAX_BEND = Math.PI / 6;

export class ThroughRuns {
  static build(edges: readonly BuiltEdge[], nodes: readonly BuiltNode[]): StreetRun[] {
    const byId = new Map(edges.map((edge) => [edge.id, edge]));
    const joins = new Map<string, string>();
    for (const node of nodes) {
      const arms = node.edgeIds.map((id) => byId.get(id)!).filter(Boolean);
      const pairs: { a: BuiltEdge; b: BuiltEdge; bend: number }[] = [];
      for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) {
        if (arms[i].class !== arms[j].class) continue;
        const a = outward(arms[i], node.id);
        const b = outward(arms[j], node.id);
        const bend = Math.acos(Math.max(-1, Math.min(1, -(a[0] * b[0] + a[1] * b[1]))));
        if (bend <= MAX_BEND) pairs.push({ a: arms[i], b: arms[j], bend });
      }
      pairs.sort((a, b) => a.bend - b.bend || a.a.id.localeCompare(b.a.id) || a.b.id.localeCompare(b.b.id));
      const used = new Set<string>();
      for (const pair of pairs) {
        if (used.has(pair.a.id) || used.has(pair.b.id)) continue;
        joins.set(key(node.id, pair.a.id), pair.b.id);
        joins.set(key(node.id, pair.b.id), pair.a.id);
        used.add(pair.a.id); used.add(pair.b.id);
      }
    }
    const visited = new Set<string>();
    const runs: StreetRun[] = [];
    const ordered = [...edges].sort((a, b) => a.id.localeCompare(b.id));
    const walk = (first: BuiltEdge, start: string): void => {
      if (visited.has(first.id)) return;
      let edge = first;
      let node = start;
      const run: StreetRun = { id: '', profileId: '', edges: [], path: [], length: 0 };
      while (!visited.has(edge.id)) {
        visited.add(edge.id);
        const forward = edge.from === node;
        const path = forward ? edge.path : [...edge.path].reverse();
        const end = run.length + pathLength(path);
        run.edges.push({ edgeId: edge.id, forward, start: run.length, end });
        run.path.push(...path.slice(run.path.length ? 1 : 0));
        run.length = end;
        node = forward ? edge.to : edge.from;
        const next = joins.get(key(node, edge.id));
        if (!next) break;
        edge = byId.get(next)!;
      }
      const firstPoint = run.path[0];
      const lastPoint = run.path[run.path.length - 1];
      if (firstPoint[0] > lastPoint[0] || (firstPoint[0] === lastPoint[0] && firstPoint[1] > lastPoint[1])) {
        run.path.reverse();
        run.edges = run.edges.reverse().map((member) => ({
          edgeId: member.edgeId, forward: !member.forward, start: run.length - member.end, end: run.length - member.start,
        }));
      }
      runs.push(run);
    };
    for (const edge of ordered) {
      const ends = [edge.from, edge.to].filter((node) => !joins.has(key(node, edge.id)));
      if (ends.length) walk(edge, ends.sort()[0]);
    }
    for (const edge of ordered) walk(edge, edge.from);
    runs.sort((a, b) => geometryOrder(a, b));
    runs.forEach((run, index) => { run.id = `sr${index}`; });
    return runs;
  }
}

/** Geometry decides hierarchy ties, so splitting an edge does not change a road's width. */
export function geometryOrder(a: StreetRun, b: StreetRun): number {
  const extent = (run: StreetRun): number[] => [
    Math.min(...run.path.map((point) => point[0])), Math.min(...run.path.map((point) => point[1])),
    Math.max(...run.path.map((point) => point[0])), Math.max(...run.path.map((point) => point[1])),
  ];
  const left = extent(a); const right = extent(b);
  for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return left[index] - right[index];
  return a.length - b.length;
}

function key(node: string, edge: string): string { return `${node}:${edge}`; }

function outward(edge: BuiltEdge, node: string): Vec2 {
  const start = edge.from === node;
  const a = start ? edge.path[0] : edge.path[edge.path.length - 1];
  const b = start ? edge.path[1] : edge.path[edge.path.length - 2];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
}
