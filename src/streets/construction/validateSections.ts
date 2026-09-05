import type { SectionedStreetEdge, StreetConstruction } from './schema/sections';
import { invariantFailure } from '../../errors';
import { length as pathLength } from '../../geom/polyline';
import { sidewalkTotal } from './Design';

/** Published construction dimensions agree with their movement compatibility fields. */
export function validateStreetSections(city: { streets: { construction?: StreetConstruction; edges: SectionedStreetEdge[] } }): void {
  const construction = city.streets.construction;
  if (!construction) return;
  const edges = new Map(city.streets.edges.map((edge) => [edge.id, edge]));
  const owned = new Set<string>();
  const ids = new Set<string>();
  for (const run of construction.runs) {
    if (ids.has(run.id) || run.edges.length === 0) fail(`run ${run.id} is repeated or empty`);
    ids.add(run.id);
    let distance = 0;
    let node: string | undefined;
    let width: number | undefined;
    for (const member of run.edges) {
      const edge = edges.get(member.edgeId);
      if (!edge || owned.has(member.edgeId)) fail(`run ${run.id} has a missing or repeated edge ${member.edgeId}`);
      owned.add(edge.id);
      const start = member.forward ? edge.from : edge.to;
      if (node !== undefined && node !== start) fail(`run ${run.id} is disconnected`);
      node = member.forward ? edge.to : edge.from;
      if (!equal(member.start, distance) || !equal(member.end - member.start, pathLength(edge.path))) fail(`run ${run.id} has inconsistent path distances`);
      distance = member.end;
      if (width !== undefined && !equal(width, edge.width)) fail(`run ${run.id} changes carriageway width`);
      width = edge.width;
      if (edge.class === 'highway') continue;
      const section = edge.crossSection;
      if (!section || section.runId !== run.id || section.profileId !== run.profileId) fail(`edge ${edge.id} has inconsistent run ownership`);
      let at = edge.width / 2 - section.shoulders.left;
      for (const lane of section.lanes) {
        if (!equal(lane.offset, at - lane.width / 2)) fail(`edge ${edge.id} has inconsistent lane offsets`);
        at -= lane.width;
      }
      if (!equal(at, -edge.width / 2 + section.shoulders.right)) fail(`edge ${edge.id} has inconsistent carriageway width`);
      for (const side of ['left', 'right'] as const) {
        if (!equal(sidewalkTotal(section.sidewalks[side].bands), edge.sidewalk[side])) fail(`edge ${edge.id} has inconsistent ${side} sidewalk width`);
      }
    }
    if (!equal(distance, run.length) || !equal(pathLength(run.path), run.length)) fail(`run ${run.id} has inconsistent total length`);
  }
  if (owned.size !== edges.size) fail('some street edges have no construction run');
}

function equal(a: number, b: number): boolean { return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-7; }
function fail(message: string): never { throw invariantFailure(message); }
