import type { Polyline, StreetClass, Vec2 } from '../../schema/blueprint';
import { length as lineLength } from '../geom/polyline';
import { dist, lerp } from '../geom/vec';
import { physicalStreetKey, streetFamily } from './PathIdentity';

interface GraphRun { class: StreetClass; a: number; b: number; path: Polyline }
interface Progress { path: Polyline; stations: number[] }

const CLASS_RANK: Record<StreetClass, number> = { highway: 0, road: 1, street: 2, alley: 3 };

function progress(path: Polyline): Progress | null {
  const start = path[0], end = path[path.length - 1];
  const x = end[0] - start[0], z = end[1] - start[1], lengthSquared = x * x + z * z;
  const stations = path.map((point) => ((point[0] - start[0]) * x + (point[1] - start[1]) * z) / lengthSquared);
  for (let i = 1; i < stations.length; i++) if (stations[i] <= stations[i - 1]) return null;
  return { path, stations };
}

function at(curve: Progress, segment: number, station: number): Vec2 {
  const from = curve.stations[segment - 1], to = curve.stations[segment];
  return lerp(curve.path[segment - 1], curve.path[segment], (station - from) / (to - from));
}

/** Paired differences are linear between these stations; their largest norm is at an endpoint. */
function corresponds(a: Progress | null, b: Progress | null, radius: number): boolean {
  if (!a || !b) return false;
  let i = 1, j = 1;
  while (i < a.path.length && j < b.path.length) {
    const station = Math.min(a.stations[i], b.stations[j]);
    if (dist(at(a, i, station), at(b, j, station)) > radius) return false;
    if (a.stations[i] === station) i++;
    if (b.stations[j] === station) j++;
  }
  return true;
}

/** Keep one direct representative for each compatible run at the declared graph resolution. */
export function resolveGraphPaths<T extends GraphRun>(edges: T[], radius: number): T[] {
  const candidates = edges.map((edge) => ({
    edge, key: physicalStreetKey(edge), length: lineLength(edge.path),
    progress: radius > 0 ? progress(edge.a < edge.b ? edge.path : [...edge.path].reverse()) : null,
  }));
  candidates.sort((a, b) => CLASS_RANK[a.edge.class] - CLASS_RANK[b.edge.class]
    || a.length - b.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const identities = new Set<string>();
  const groups = new Map<string, typeof candidates>();
  const result: T[] = [];
  for (const candidate of candidates) {
    if (identities.has(candidate.key)) continue;
    const edge = candidate.edge;
    const groupKey = `${Math.min(edge.a, edge.b)}:${Math.max(edge.a, edge.b)}:${streetFamily(edge.class)}`;
    const group = groups.get(groupKey) ?? [];
    if (radius > 0 && group.some((retained) => corresponds(candidate.progress, retained.progress, radius))) continue;
    identities.add(candidate.key);
    group.push(candidate);
    groups.set(groupKey, group);
    result.push(edge);
  }
  return result;
}
