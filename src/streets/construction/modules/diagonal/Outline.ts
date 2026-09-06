import type { Polygon, Vec2 } from '../../../../../schema/blueprint';
import { snapPoint } from '../../../../geom/clip';
import { unsatisfiable } from '../../../../errors';

export interface Side { start: Vec2; end: Vec2; direction: Vec2; normal: Vec2; offset: number; length: number; width: number }
export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];

/** Convex half-plane clipping keeps only the selected side of a fixed cut. */
export function halfPlane(polygon: Polygon, normal: Vec2, offset: number): Polygon {
  const out: Polygon = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = dot(normal, a) - offset, db = dot(normal, b) - offset;
    if (da >= 0) out.push(a);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

export function sides(polygon: Polygon, widthOf: (direction: Vec2) => number): Side[] {
  return polygon.map((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const direction: Vec2 = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
    const normal: Vec2 = [-direction[1], direction[0]];
    return { start, end, direction, normal, offset: dot(normal, start), length, width: widthOf(direction) };
  });
}

export function insetVertex(previous: Side, side: Side): Vec2 {
  const a = previous.normal, b = side.normal;
  const d = previous.offset + previous.width + 0.5, e = side.offset + side.width + 0.5;
  const determinant = a[0] * b[1] - a[1] * b[0];
  return [(d * b[1] - a[1] * e) / determinant, (a[0] * e - d * b[0]) / determinant];
}

export function rounded(sides: Side[]): { polygon: Polygon; tangents: number[] } {
  const radius = 2.5;
  const turns = sides.map((side, i) => {
    const previous = sides[(i + sides.length - 1) % sides.length];
    return Math.atan2(previous.direction[0] * side.direction[1] - previous.direction[1] * side.direction[0], dot(previous.direction, side.direction));
  });
  const tangents = turns.map(turn => radius * Math.tan(turn / 2));
  if (sides.some((side, i) => side.length <= tangents[i] + tangents[(i + 1) % sides.length])) {
    throw unsatisfiable('diagonal block cannot hold its rounded junction returns');
  }
  const polygon = sides.flatMap((side, i): Polygon => {
    const previous = sides[(i + sides.length - 1) % sides.length];
    const start: Vec2 = [side.start[0] - previous.direction[0] * tangents[i], side.start[1] - previous.direction[1] * tangents[i]];
    const center: Vec2 = [start[0] + previous.normal[0] * radius, start[1] + previous.normal[1] * radius];
    const angle = Math.atan2(start[1] - center[1], start[0] - center[0]);
    const count = Math.max(1, Math.round(turns[i] / (Math.PI / 24)));
    return Array.from({ length: count + 1 }, (_, station) => snapPoint([
      center[0] + radius * Math.cos(angle + turns[i] * station / count),
      center[1] + radius * Math.sin(angle + turns[i] * station / count),
    ]));
  });
  return { polygon, tangents };
}
