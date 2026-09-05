import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { invalidParams } from '../../../errors';
import { bufferLine, difference, intersection, union } from '../../../geom/clip';
import { StreetCorridors } from '../StreetCorridors';
import { clearanceFootprints } from './PhysicalClearance';
import { roadFrontage } from './Frontage';
import { landFaces } from './LandFaces';
import { SourceCuts } from './SourceCuts';
import { physicalPlan } from './PhysicalOwners';
import type { DatumClearanceInput, DatumClearanceRegion, DatumPhysicalInput, DatumPhysicalPlan, DatumRoadwayInput, DatumRoadwayPlan, GradeDatumInput, GradeDatumPlan } from './schema';

export class GradeDatum {
  static plan(input: GradeDatumInput): GradeDatumPlan {
    if (!Number.isFinite(input.pedestrianTop)
      || input.pedestrianTop < input.roadwayTop) throw invalidParams('datum ground levels are invalid');
    const sources = new SourceCuts(input);
    const corridors = new StreetCorridors(input.edges);
    const spans = sources.spans;
    const clipped = (polygons: Polygon[]): Polygon[] => intersection(polygons, [input.boundary]);
    const grade: GradeDatumPlan['grade'] = {
      roadway: sources.roadway(edge => corridors.roadway.get(edge.id) ?? []), pedestrian: [], corridors: [], full: [],
    };
    const transitions: { spanId: string; line: [Vec2, Vec2] }[] = [];
    for (const row of sources.rows) {
      const { edge, cells } = row;
      const inclusive = corridors.byEdge.get(edge.id) ?? [];
      const sidewalks = {
        left: StreetCorridors.sidewalk(edge, 'left'), right: StreetCorridors.sidewalk(edge, 'right'),
      };
      for (const span of row.spans.filter(candidate => candidate.elevation === 'at-grade')) {
        for (const station of [span.start, span.end]) {
          if (row.spans.some(other => other.elevation === 'off-grade'
            && (other.start.distance === station.distance || other.end.distance === station.distance))) {
            transitions.push({ spanId: span.id, line: cells.cutLine(station) });
          }
        }
        const slice = (polygons: Polygon[]): Polygon[] => sources.slice(row, polygons, span);
        const complete = slice(inclusive);
        if (complete.length) grade.corridors.push({ spanId: span.id, polygons: complete });
        for (const side of ['left', 'right'] as const) {
          const polygons = slice(sidewalks[side]);
          if (polygons.length) grade.pedestrian.push({ spanId: span.id, side, polygons });
        }
      }
    }
    const roadway = union(grade.roadway.flatMap(owner => owner.polygons));
    grade.pedestrian = grade.pedestrian.map(owner => ({ ...owner, polygons: difference(owner.polygons, roadway) }))
      .filter(owner => owner.polygons.length > 0);
    grade.full = union([...roadway, ...grade.pedestrian.flatMap(owner => owner.polygons)]);
    const land = landFaces(input.boundary, spans, roadway);
    const physical = physicalPlan(input).physical.map(owner => ({ ...owner,
      spanIds: spans.filter(span => span.edgeId === owner.edgeId).map(span => span.id) }));
    return {
      boundary: input.boundary, spans, grade, land, physical,
      projected: {
        edges: input.edges.map(edge => ({ edgeId: edge.id, polygons: clipped(corridors.byEdge.get(edge.id) ?? []) })),
        structures: input.structures.map(structure => ({
          edgeIds: structure.edgeIds, polygons: clipped(bufferLine(structure.path, structure.width)),
        })),
      },
      roadFrontage: roadFrontage(roadway, land, grade.roadway, transitions),
    };
  }

  static clearanceFootprints(input: DatumClearanceInput): DatumClearanceRegion[] {
    return clearanceFootprints(input);
  }

  static physicalPlan(input: DatumPhysicalInput): DatumPhysicalPlan { return physicalPlan(input); }

  static roadwayPlan(input: DatumRoadwayInput): DatumRoadwayPlan {
    const sources = new SourceCuts(input);
    return { spans: sources.spans, roadway: sources.roadway(edge => StreetCorridors.roadwayFor(edge)) };
  }
}
