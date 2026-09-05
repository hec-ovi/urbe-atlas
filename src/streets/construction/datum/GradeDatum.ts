import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { invalidParams, invariantFailure } from '../../../errors';
import { bufferLine, difference, intersection, union } from '../../../geom/clip';
import { StreetCorridors } from '../StreetCorridors';
import { clearanceFootprints } from './PhysicalClearance';
import { roadFrontage } from './Frontage';
import { landFaces } from './LandFaces';
import { PathStations } from './PathStations';
import { StationCells } from './StationCells';
import type { DatumClearanceInput, DatumClearanceRegion, GradeDatumInput, GradeDatumPlan } from './schema';

export class GradeDatum {
  static plan(input: GradeDatumInput): GradeDatumPlan {
    if (!Number.isFinite(input.roadwayTop) || !Number.isFinite(input.pedestrianTop)
      || input.pedestrianTop < input.roadwayTop) throw invalidParams('datum ground levels are invalid');
    if (input.boundary.length < 3 || input.boundary.some(point => point.some(value => !Number.isFinite(value)))) {
      throw invariantFailure('datum has no finite city boundary');
    }
    const sources = new Map<string, PathStations>();
    for (const edge of input.edges) {
      if (sources.has(edge.id)) throw invariantFailure(`datum repeats edge ${edge.id}`);
      if (![edge.width, edge.sidewalk.left, edge.sidewalk.right].every(value => Number.isFinite(value) && value >= 0)
        || edge.width + edge.sidewalk.left + edge.sidewalk.right <= 0) {
        throw invariantFailure(`datum edge ${edge.id} has invalid corridor widths`);
      }
      sources.set(edge.id, new PathStations(edge.path, edge.elevationProfile, edge.id));
    }
    const corridors = new StreetCorridors(input.edges);
    const spans = [...sources.values()].flatMap(source => source.spans(input.roadwayTop));
    const clipped = (polygons: Polygon[]): Polygon[] => intersection(polygons, [input.boundary]);
    const grade: GradeDatumPlan['grade'] = { roadway: [], pedestrian: [], full: [] };
    const transitions: { spanId: string; line: [Vec2, Vec2] }[] = [];
    for (const edge of input.edges) {
      const source = sources.get(edge.id)!;
      const radius = edge.width / 2 + Math.max(edge.sidewalk.left, edge.sidewalk.right);
      const cells = new StationCells(source, radius);
      const roadway = corridors.roadway.get(edge.id) ?? [];
      const sidewalks = {
        left: StreetCorridors.sidewalk(edge, 'left'), right: StreetCorridors.sidewalk(edge, 'right'),
      };
      for (const span of spans.filter(candidate => candidate.edgeId === edge.id && candidate.elevation === 'at-grade')) {
        for (const station of [span.start, span.end]) {
          if (spans.some(other => other.edgeId === edge.id && other.elevation === 'off-grade'
            && (other.start.distance === station.distance || other.end.distance === station.distance))) {
            transitions.push({ spanId: span.id, line: cells.cutLine(station) });
          }
        }
        const slice = (polygons: Polygon[]): Polygon[] => clipped(cells.slice(polygons, span.start.distance, span.end.distance));
        const polygons = slice(roadway);
        if (polygons.length) grade.roadway.push({ spanId: span.id, polygons });
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
    const physical: GradeDatumPlan['physical'] = [];
    const claimed = new Set<string>();
    const byId = new Map(input.edges.map(edge => [edge.id, edge]));
    for (const structure of input.structures) {
      if (structure.edgeIds.length === 0 || !Number.isFinite(structure.deckThickness)
        || structure.deckThickness <= 0 || structure.deckThickness >= structure.level) {
        throw invariantFailure('datum structure has no valid deck ownership');
      }
      for (const edgeId of structure.edgeIds) {
        const edge = byId.get(edgeId);
        if (!edge || claimed.has(edgeId) || edge.width !== structure.width || edge.level !== structure.level) {
          throw invariantFailure(`datum structure conflicts with edge ${edgeId}`);
        }
        claimed.add(edgeId);
        physical.push({
          kind: 'deck', edgeId, path: edge.path, width: edge.width,
          spanIds: spans.filter(span => span.edgeId === edgeId).map(span => span.id),
          polygons: clipped(corridors.roadway.get(edgeId) ?? []),
          topProfile: edge.elevationProfile,
          undersideProfile: edge.elevationProfile.map(knot => ({ ...knot, level: knot.level - structure.deckThickness })),
        });
      }
    }
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
}
