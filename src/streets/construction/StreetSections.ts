import type { Vec2 } from '../../../schema/blueprint';
import type { DistrictKind } from '../../../schema/params';
import type { BuiltEdge, BuiltNode } from '../Graph';
import type { RoadProfile, SidewalkBands, SidewalkProfile, StreetDesign } from './schema/design';
import type { SectionedStreetEdge, StreetCrossSection, StreetRun } from './schema/sections';
import { roadwayTotal, sidewalkTotal } from './Design';
import { geometryOrder, ThroughRuns } from './ThroughRuns';
import { length as pathLength, offsetAt } from '../../geom/polyline';
import { alleySideWidth, HIGHWAY_WIDTH } from '../widths';
import { LEVELS } from '../../levels';

export class StreetSections {
  static plan(
    edges: readonly BuiltEdge[], nodes: readonly BuiltNode[], design: StreetDesign,
    districtAt: (point: Vec2) => DistrictKind,
  ): { edges: SectionedStreetEdge[]; runs: StreetRun[] } {
    const runs = ThroughRuns.build(edges, nodes);
    const byId = new Map(edges.map((edge) => [edge.id, edge]));
    const profiles = new Map<string, RoadProfile>();
    for (const cls of ['street', 'road'] as const) {
      const eligible = design.profiles.filter((profile) => profile.classes.includes(cls));
      const hierarchy = runs.filter((run) => byId.get(run.edges[0].edgeId)!.class === cls)
        .sort((a, b) => Math.abs(b.length - a.length) > 1e-7 ? b.length - a.length : geometryOrder(a, b));
      hierarchy.forEach((run, rank) => {
        // A quarter of the longest primary corridors take the broadest profile.
        // The remaining corridors progress through the other configured sizes.
        const fraction = (rank + 0.5) / hierarchy.length;
        const index = eligible.length === 1 ? 0 : fraction <= 0.25
          ? eligible.length - 1 : Math.max(0, Math.floor((1 - fraction) * (eligible.length - 1)));
        profiles.set(run.id, eligible[index]);
      });
    }
    const sections = new Map<string, StreetCrossSection>();
    for (const run of runs) {
      const first = byId.get(run.edges[0].edgeId)!;
      const profile = profiles.get(run.id);
      run.profileId = profile?.id ?? first.class;
      for (const member of run.edges) {
        const edge = byId.get(member.edgeId)!;
        if (edge.class === 'highway') continue;
        const width = profile ? roadwayTotal(profile) : 0;
        const middle = pathLength(edge.path) / 2;
        const side = (sign: 1 | -1): { profileId: string; bands: SidewalkBands } => {
          const kind = districtAt(offsetAt(edge.path, middle, sign * (width / 2 + 1)));
          if (edge.class === 'alley') {
            return { profileId: edge.class, bands: {
              curb: 0, border: 0, furnishing: 0, walking: alleySideWidth(kind), frontage: 0,
            } };
          }
          const dense = kind === 'downtown' || kind === 'commercial';
          const target = dense ? edge.class === 'road' ? 3 : 2 : kind === 'mixed' || edge.class === 'road' ? 1 : 0;
          const chosen = design.sidewalkProfiles[Math.min(target, design.sidewalkProfiles.length - 1)];
          return { profileId: chosen.id, bands: bandsOnly(chosen) };
        };
        const shoulders = profile
          ? member.forward ? { ...profile.shoulders } : { left: profile.shoulders.right, right: profile.shoulders.left }
          : { left: 0, right: 0 };
        const laneDesign = profile ? member.forward ? profile.lanes : [...profile.lanes].reverse().map((lane) => ({
          width: lane.width, direction: lane.direction === 'forward' ? 'backward' as const : 'forward' as const,
        })) : [];
        let at = width / 2 - shoulders.left;
        const lanes = laneDesign.map((lane) => {
          const offset = at - lane.width / 2;
          at -= lane.width;
          return { ...lane, offset };
        });
        sections.set(edge.id, {
          runId: run.id, profileId: run.profileId, lanes, shoulders,
          sidewalks: { left: side(1), right: side(-1) },
        });
      }
    }
    return { runs, edges: edges.map((edge) => {
      if (edge.class === 'highway') return {
        ...edge, width: HIGHWAY_WIDTH, sidewalk: { left: 0, right: 0 },
        districtIds: [], level: LEVELS.highway, elevationProfile: [],
      };
      const crossSection = sections.get(edge.id)!;
      const width = crossSection.lanes.reduce((sum, lane) => sum + lane.width, 0)
        + crossSection.shoulders.left + crossSection.shoulders.right;
      return {
        ...edge, width, crossSection,
        sidewalk: { left: sidewalkTotal(crossSection.sidewalks.left.bands), right: sidewalkTotal(crossSection.sidewalks.right.bands) },
        districtIds: [], level: LEVELS.ground, elevationProfile: [],
      };
    }) };
  }
}

function bandsOnly(profile: SidewalkProfile): SidewalkBands {
  return { curb: profile.curb, border: profile.border, furnishing: profile.furnishing, walking: profile.walking, frontage: profile.frontage };
}
