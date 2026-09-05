import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import type { PavingFrame, PavingModule } from './schema';

export type Bounds = { min: Vec2; max: Vec2 };

export function bounds(polygons: Polygon[]): Bounds {
  const result: Bounds = { min: [Infinity, Infinity], max: [-Infinity, -Infinity] };
  for (const polygon of polygons) for (const point of polygon) {
    for (const axis of [0, 1] as const) {
      result.min[axis] = Math.min(result.min[axis], point[axis]);
      result.max[axis] = Math.max(result.max[axis], point[axis]);
    }
  }
  return result;
}

export function overlaps(a: Bounds, b: Bounds): boolean {
  return a.min[0] <= b.max[0] && a.max[0] >= b.min[0]
    && a.min[1] <= b.max[1] && a.max[1] >= b.min[1];
}

export function area(polygon: Polygon): number {
  const origin = polygon[0];
  let twice = 0;
  for (let i = 1; i + 1 < polygon.length; i++) {
    const a = polygon[i], b = polygon[i + 1];
    twice += (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
  }
  return twice / 2;
}

export function rectangle(a: Vec2, b: Vec2, low: number, high: number): Polygon {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n: Vec2 = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
  return [
    [a[0] + n[0] * low, a[1] + n[1] * low],
    [b[0] + n[0] * low, b[1] + n[1] * low],
    [b[0] + n[0] * high, b[1] + n[1] * high],
    [a[0] + n[0] * high, a[1] + n[1] * high],
  ];
}

export function local(frame: PavingFrame, point: Vec2): Vec2 {
  const x = point[0] - frame.origin[0], z = point[1] - frame.origin[1];
  return [x * frame.u[0] + z * frame.u[1], -x * frame.u[1] + z * frame.u[0]];
}

/** The contract's only cell-grid snap, addressed by integer base-cell indices. */
export function corner(frame: PavingFrame, module: PavingModule, column: number, row: number): Vec2 {
  const du = column * (module.pitch[0] / (module.baseCells?.[0] ?? 1));
  const dv = row * (module.pitch[1] / (module.baseCells?.[1] ?? 1));
  return [
    Math.round(((frame.origin[0] + frame.u[0] * du) - frame.u[1] * dv) * 1000) / 1000,
    Math.round(((frame.origin[1] + frame.u[1] * du) + frame.u[0] * dv) * 1000) / 1000,
  ];
}

export function cell(frame: PavingFrame, module: PavingModule, column: number, row: number): Polygon {
  return outline(frame, module, column, column + 1, row, row + 1);
}

export function outline(frame: PavingFrame, module: PavingModule, left: number, right: number, bottom: number, top: number): Polygon {
  const u = module.baseCells?.[0] ?? 1, v = module.baseCells?.[1] ?? 1;
  const points: Vec2[] = [];
  for (let column = left * u; column < right * u; column++) points.push(corner(frame, module, column, bottom * v));
  for (let row = bottom * v; row < top * v; row++) points.push(corner(frame, module, right * u, row));
  for (let column = right * u; column > left * u; column--) points.push(corner(frame, module, column, top * v));
  for (let row = top * v; row > bottom * v; row--) points.push(corner(frame, module, left * u, row));
  return points;
}
