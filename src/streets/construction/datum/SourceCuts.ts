import type { Polygon, StreetEdge } from '../../../../schema/blueprint';
import { invalidParams, invariantFailure } from '../../../errors';
import { intersection } from '../../../geom/clip';
import { PathStations } from './PathStations';
import { validateBoundary } from './PhysicalOwners';
import { StationCells } from './StationCells';
import type { DatumRoadwayInput, DatumRoadwayOwner, DatumSpan } from './schema';

interface SourceRow { edge: StreetEdge; cells: StationCells; spans: DatumSpan[] }

/** Shared source profiles and cuts for full and roadway-only grade queries. */
export class SourceCuts {
  readonly rows: SourceRow[];
  readonly spans: DatumSpan[];
  private readonly boundary: Polygon;

  constructor(input: DatumRoadwayInput) {
    if (!Number.isFinite(input.roadwayTop)) throw invalidParams('datum roadway top is not finite');
    validateBoundary(input.boundary);
    this.boundary = input.boundary;
    const ids = new Set<string>();
    this.rows = input.edges.map(edge => {
      if (ids.has(edge.id)) throw invariantFailure(`datum repeats edge ${edge.id}`);
      ids.add(edge.id);
      if (![edge.width, edge.sidewalk.left, edge.sidewalk.right].every(value => Number.isFinite(value) && value >= 0)
        || edge.width + edge.sidewalk.left + edge.sidewalk.right <= 0) {
        throw invariantFailure(`datum edge ${edge.id} has invalid corridor widths`);
      }
      const source = new PathStations(edge.path, edge.elevationProfile, edge.id);
      const radius = edge.width / 2 + Math.max(edge.sidewalk.left, edge.sidewalk.right);
      return { edge, cells: new StationCells(source, radius), spans: source.spans(input.roadwayTop) };
    });
    this.spans = this.rows.flatMap(row => row.spans);
  }

  slice(row: SourceRow, polygons: Polygon[], span: DatumSpan): Polygon[] {
    return intersection(row.cells.slice(polygons, span.start.distance, span.end.distance), [this.boundary]);
  }

  roadway(polygonsFor: (edge: StreetEdge) => Polygon[]): DatumRoadwayOwner[] {
    return this.rows.flatMap(row => {
      const spans = row.spans.filter(span => span.elevation === 'at-grade');
      if (spans.length === 0 || row.edge.width === 0) return [];
      const roadway = polygonsFor(row.edge);
      return spans.flatMap(span => {
        const polygons = this.slice(row, roadway, span);
        return polygons.length ? [{ spanId: span.id, polygons }] : [];
      });
    });
  }
}
