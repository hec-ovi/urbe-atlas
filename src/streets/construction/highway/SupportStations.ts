import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { bounds } from '../../../geom/polygon';
import { HIGHWAY_DECK } from './dimensions';
import type { HighwayEnvelope } from './schema';

export type SupportObstacle = { polygon: Polygon; box: ReturnType<typeof bounds> };

export function lateralOffsets(envelope: HighwayEnvelope): number[] {
  const lateral = Math.max(0, envelope.width / 2 - HIGHWAY_DECK.supportSize / 2 - 0.5);
  return [0, lateral, -lateral];
}

/** Obstacles a column could ever touch: the three strips its square sweeps along the run. */
export function corridorObstacles(
  envelope: HighwayEnvelope, obstacles: readonly SupportObstacle[],
): SupportObstacle[] {
  const half = HIGHWAY_DECK.supportSize / 2;
  const strips: ReturnType<typeof bounds>[] = [];
  for (let i = 1; i < envelope.path.length; i++) {
    const p = envelope.path[i - 1], q = envelope.path[i];
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (length === 0) continue;
    const direction: Vec2 = [(q[0] - p[0]) / length, (q[1] - p[1]) / length];
    for (const offset of lateralOffsets(envelope)) {
      const a: Vec2 = [p[0] - direction[1] * offset, p[1] + direction[0] * offset];
      const b: Vec2 = [q[0] - direction[1] * offset, q[1] + direction[0] * offset];
      strips.push({
        min: [Math.min(a[0], b[0]) - half, Math.min(a[1], b[1]) - half],
        max: [Math.max(a[0], b[0]) + half, Math.max(a[1], b[1]) + half],
      });
    }
  }
  return obstacles.filter((obstacle) => strips.some((strip) =>
    obstacle.box.min[0] < strip.max[0] && obstacle.box.max[0] > strip.min[0]
    && obstacle.box.min[1] < strip.max[1] && obstacle.box.max[1] > strip.min[1]));
}

/** Moving-square contact events: every station where a column starts or stops touching an obstacle. */
export function contactStations(
  envelope: HighwayEnvelope, from: number, to: number, obstacles: readonly SupportObstacle[],
): number[] {
  const stations = new Set<number>([from, to]);
  const half = HIGHWAY_DECK.supportSize / 2;
  const corners: Vec2[] = [[-half, -half], [half, -half], [half, half], [-half, half]];
  const include = (station: number): void => {
    // Snapping a contact center can choose either adjacent millimetre cell.
    for (const candidate of [station, station - 0.001, station + 0.001]) {
      if (candidate >= from && candidate <= to) stations.add(candidate);
    }
  };
  let start = 0;
  for (let i = 1; i < envelope.path.length; i++) {
    const p = envelope.path[i - 1], q = envelope.path[i];
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const end = start + length;
    if (length > 0 && end >= from && start <= to) {
      const direction: Vec2 = [(q[0] - p[0]) / length, (q[1] - p[1]) / length];
      const lower = Math.max(0, from - start), upper = Math.min(length, to - start);
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
  return [...stations].sort((a, b) => a - b);
}

function cross(a: Vec2, b: Vec2): number { return a[0] * b[1] - a[1] * b[0]; }
