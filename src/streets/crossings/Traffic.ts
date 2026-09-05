import type { Polygon } from '../../../schema/blueprint';
import { invalidParams } from '../../errors';
import { hasGradeSpan, isGradeTraffic } from './Eligibility';
import type { CrossingSourceInput } from './schema';

/** Traffic ownership is independent of sidewalk and crossing-marking eligibility. */
export class Traffic {
  readonly byEdge: Map<string, Polygon[]>;

  constructor(input: CrossingSourceInput) {
    const edges = new Map(input.edges.map(edge => [edge.id, edge]));
    if (input.gradeRoadway) {
      this.byEdge = new Map();
      for (const source of input.gradeRoadway) {
        const edge = edges.get(source.edgeId);
        if (!edge || !(edge.width > 0) || !hasGradeSpan(edge) || this.byEdge.has(edge.id)) {
          throw invalidParams('crossing grade roadway has an invalid or repeated source edge', { edgeId: source.edgeId });
        }
        this.byEdge.set(source.edgeId, source.polygons);
      }
      for (const edge of input.edges) {
        if (edge.width > 0 && hasGradeSpan(edge) && !this.byEdge.has(edge.id)) {
          throw invalidParams('crossing grade roadway omits a source edge', { edgeId: edge.id });
        }
      }
      return;
    }
    if (input.edges.some(edge => edge.width > 0 && hasGradeSpan(edge) && !isGradeTraffic(edge))) {
      throw invalidParams('mixed street profiles require exact grade roadway inputs');
    }
    const grade = new Set(input.edges.filter(isGradeTraffic).map(edge => edge.id));
    this.byEdge = new Map(input.reservations.edges.filter(source => grade.has(source.edgeId))
      .map(source => [source.edgeId, source.roadway]));
  }
}
