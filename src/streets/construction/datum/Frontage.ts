import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { invariantFailure } from '../../../errors';
import { bufferLine, GRID_STEP, intersection, offset } from '../../../geom/clip';
import { bounds } from '../../../geom/polygon';
import { sharedBoundary } from './Boundaries';
import type { GradeDatumPlan } from './schema';

export function roadFrontage(
  roadway: Polygon[], land: GradeDatumPlan['land'], owners: GradeDatumPlan['grade']['roadway'],
  transitions: { spanId: string; line: [Vec2, Vec2] }[],
): GradeDatumPlan['roadFrontage'] {
  const candidates = owners.flatMap(owner => offset(owner.polygons, GRID_STEP)
    .map(polygon => ({ spanId: owner.spanId, polygon, box: bounds(polygon) })));
  return land.flatMap(face => sharedBoundary(roadway, face.polygons).map(({ a, b }) => {
    // Source and result boundaries each carry one grid cell of correspondence
    // uncertainty. This query assigns ancestry only; it changes no geometry.
    const neighborhood = bufferLine([a, b], GRID_STEP * 2);
    const box = bounds(neighborhood.flat());
    const spanIds = [...new Set(candidates.filter(owner =>
      box.min[0] < owner.box.max[0] && box.max[0] > owner.box.min[0]
      && box.min[1] < owner.box.max[1] && box.max[1] > owner.box.min[1]
      && intersection(neighborhood, [owner.polygon]).length > 0).map(owner => owner.spanId))].sort();
    if (spanIds.length === 0) throw invariantFailure(`datum face ${face.id} has frontage without a grade source`, { a, b });
    const transition = transitions.some(cut => {
      if (!spanIds.includes(cut.spanId)) return false;
      const [start, end] = cut.line;
      const dx = end[0] - start[0];
      const dz = end[1] - start[1];
      const distance = (point: Vec2): number => Math.abs(dx * (point[1] - start[1]) - dz * (point[0] - start[0])) / Math.hypot(dx, dz);
      return distance(a) <= GRID_STEP && distance(b) <= GRID_STEP;
    });
    return { landId: face.id, spanIds, kind: transition ? 'elevation-transition' : 'road-edge', path: [a, b] };
  }));
}
