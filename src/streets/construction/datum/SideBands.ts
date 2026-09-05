import { invalidParams, invariantFailure } from '../../../errors';
import { SourcePartition } from '../../../geom/partition/SourcePartition';
import { StreetCorridors } from '../StreetCorridors';
import type { SourceCuts } from './SourceCuts';
import type { DatumSideBand, GradeDatumInput } from './schema';

/** Full edge-local claims; final ground owns junction precedence and physical returns. */
export class SideBands {
  static validateFormat(input: GradeDatumInput): void {
    if (input.groundFormat !== undefined && input.groundFormat !== 'side-bands-v1') {
      throw invalidParams('datum ground format is unsupported', { groundFormat: input.groundFormat });
    }
    for (const edge of input.edges) for (const side of ['left', 'right'] as const) {
      const geometry = edge.crossSection?.sidewalks[side].geometry;
      if (geometry === undefined) continue;
      if (input.groundFormat === undefined) {
        throw invariantFailure('grade datum requires curb-only sidewalk sections', {
          edgeId: edge.id, side, version: geometry.version,
        });
      }
      if (geometry.version !== '1.0.0') throw invariantFailure('datum side geometry version is unsupported', {
        edgeId: edge.id, side, version: geometry.version,
      });
    }
  }

  static plan(input: GradeDatumInput, rows: SourceCuts['rows']): DatumSideBand[] {
    const output: DatumSideBand[] = [];
    const domainId = 'datum-city';
    let domain: SourcePartition | undefined;
    for (const { edge, spans } of rows) for (const side of ['left', 'right'] as const) {
      const geometry = edge.crossSection?.sidewalks[side].geometry;
      if (geometry === undefined) continue;
      const offGrade = spans.filter(span => span.elevation !== 'at-grade');
      if (offGrade.length) {
        throw invariantFailure('datum explicit side requires a wholly flat source at the roadway datum', {
          edgeId: edge.id, side, spanIds: offGrade.map(span => span.id),
        });
      }
      domain ??= SourcePartition.create({ id: domainId, source: input.boundary });
      for (const mask of StreetCorridors.sidewalk(edge, side)) {
        if (!domain.covers(domainId, mask)) throw invariantFailure('datum explicit side leaves the city domain', {
          edgeId: edge.id, side, mask,
        });
      }
      const spanIds = spans.map(span => span.id);
      for (const interval of geometry.intervals) output.push({
        edgeId: edge.id, spanIds: [...spanIds], side, role: interval.role,
        top: input.roadwayTop + interval.top,
        masks: StreetCorridors.band(edge, side, interval.role),
      });
    }
    return output;
  }
}
