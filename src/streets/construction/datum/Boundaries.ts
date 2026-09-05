import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { GRID_STEP } from '../../../geom/clip';

export interface BoundarySegment { a: Vec2; b: Vec2 }
interface Event { point: Vec2; delta: [number, number] }

/** Opposing shared edges cancel, including collinear edges split differently. */
export function sharedBoundary(roadway: Polygon[], land: Polygon[]): BoundarySegment[] {
  const lines = new Map<string, Map<number, Event>>();
  for (const [channel, polygons] of [roadway, land].entries()) {
    for (const polygon of polygons) {
      for (let index = 0; index < polygon.length; index++) {
        const a = gridPoint(polygon[index]);
        const b = gridPoint(polygon[(index + 1) % polygon.length]);
        const dx = BigInt(b[0] - a[0]);
        const dz = BigInt(b[1] - a[1]);
        if (dx === 0n && dz === 0n) continue;
        const divisor = gcd(dx, dz);
        const sign = dx > 0n || (dx === 0n && dz > 0n) ? 1 : -1;
        const ux = dx / divisor * BigInt(sign);
        const uz = dz / divisor * BigInt(sign);
        const key = `${ux}:${uz}:${ux * BigInt(a[1]) - uz * BigInt(a[0])}`;
        const events = lines.get(key) ?? new Map<number, Event>();
        lines.set(key, events);
        const axis = ux === 0n ? 1 : 0;
        const lower = a[axis] < b[axis] ? a : b;
        const upper = lower === a ? b : a;
        for (const [point, change] of [[lower, sign], [upper, -sign]] as [Vec2, number][]) {
          const event = events.get(point[axis]) ?? { point: [point[0] * GRID_STEP, point[1] * GRID_STEP], delta: [0, 0] };
          event.delta[channel] += change;
          events.set(point[axis], event);
        }
      }
    }
  }
  const result: BoundarySegment[] = [];
  for (const events of lines.values()) {
    const sorted = [...events.entries()].sort((a, b) => a[0] - b[0]);
    const active = [0, 0];
    let previous: Vec2 | undefined;
    for (const [, event] of sorted) {
      if (previous && active[0] * active[1] < 0) {
        result.push(active[0] > 0 ? { a: previous, b: event.point } : { a: event.point, b: previous });
      }
      active[0] += event.delta[0];
      active[1] += event.delta[1];
      previous = event.point;
    }
  }
  return result;
}

function gridPoint(point: Vec2): Vec2 {
  return [Math.round(point[0] / GRID_STEP), Math.round(point[1] / GRID_STEP)];
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}
