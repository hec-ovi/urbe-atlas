import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { bounds } from '../../../geom/polygon';
import { HIGHWAY_DECK } from './dimensions';
import type { HighwayEnvelope } from './schema';

export type SupportObstacle = { polygon: Polygon; box: ReturnType<typeof bounds> };

export function lateralOffsets(envelope: HighwayEnvelope): number[] {
  const lateral = Math.max(0, envelope.width / 2 - HIGHWAY_DECK.supportSize / 2 - 0.5);
  return [0, lateral, -lateral];
}

/** Moving-square contact events bound every clear interval along a straight path segment. */
export function supportStations(
  envelope: HighwayEnvelope, after: number, target: number, obstacles: readonly SupportObstacle[],
): number[] {
  const stations = new Set<number>([target]);
  const half = HIGHWAY_DECK.supportSize / 2;
  const corners: Vec2[] = [[-half, -half], [half, -half], [half, half], [-half, half]];
  const include = (station: number): void => {
    // Snapping a contact center can choose either adjacent millimetre cell.
    for (const candidate of [station, station - 0.001, station + 0.001]) {
      if (candidate >= after + 1 && candidate <= target) stations.add(candidate);
    }
  };
  let start = 0;
  for (let i = 1; i < envelope.path.length; i++) {
    const p = envelope.path[i - 1], q = envelope.path[i];
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const end = start + length;
    if (length > 0 && end >= after + 1 && start <= target) {
      const direction: Vec2 = [(q[0] - p[0]) / length, (q[1] - p[1]) / length];
      const lower = Math.max(0, after + 1 - start), upper = Math.min(length, target - start);
      include(start + lower); include(start + upper);
      for (const offset of lateralOffsets(envelope)) {
        const origin: Vec2 = [p[0] - direction[1] * offset, p[1] + direction[0] * offset];
        const corridor = bounds([lower, upper].flatMap(along => corners.map(([x, z]): Vec2 =>
          [origin[0] + direction[0] * along + x, origin[1] + direction[1] * along + z])));
        const contact = (a: Vec2, b: Vec2): void => {
          const edge: Vec2 = [b[0] - a[0], b[1] - a[1]];
          const relative: Vec2 = [a[0] - origin[0], a[1] - origin[1]];
          const denominator = cross(direction, edge);
          if (denominator === 0) {
            if (cross(relative, direction) === 0) {
              include(start + relative[0] * direction[0] + relative[1] * direction[1]);
              include(start + (b[0] - origin[0]) * direction[0] + (b[1] - origin[1]) * direction[1]);
            }
            return;
          }
          const along = cross(relative, edge) / denominator;
          const fraction = cross(relative, direction) / denominator;
          if (along >= lower && along <= upper && fraction >= 0 && fraction <= 1) include(start + along);
        };
        for (const obstacle of obstacles) {
          if (obstacle.box.min[0] > corridor.max[0] || obstacle.box.max[0] < corridor.min[0]
            || obstacle.box.min[1] > corridor.max[1] || obstacle.box.max[1] < corridor.min[1]) continue;
          for (let vertex = 0; vertex < obstacle.polygon.length; vertex++) {
            const a = obstacle.polygon[vertex], b = obstacle.polygon[(vertex + 1) % obstacle.polygon.length];
            for (let corner = 0; corner < corners.length; corner++) {
              const [x, z] = corners[corner], [nextX, nextZ] = corners[(corner + 1) % corners.length];
              contact([a[0] + x, a[1] + z], [b[0] + x, b[1] + z]);
              contact([a[0] + x, a[1] + z], [a[0] + nextX, a[1] + nextZ]);
            }
          }
        }
      }
    }
    start = end;
  }
  return [...stations].sort((a, b) => b - a);
}

function cross(a: Vec2, b: Vec2): number { return a[0] * b[1] - a[1] * b[0]; }
