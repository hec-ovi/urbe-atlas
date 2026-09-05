import { EndType, FillRule, JoinType, area, inflatePaths, union } from 'clipper2-ts';
import { invariantFailure } from '../errors';
import type { Polygon } from './schema';

const SUBDIVISIONS = 1024;

/** Oriented diagnostic contours retain their sub-grid coordinates. */
export function precisionInterior(polygons: Polygon[], boundaryWidth: number): Polygon[] {
  if (!Number.isFinite(boundaryWidth) || boundaryWidth <= 0) {
    throw invariantFailure('polygon diagnostic boundary width must be finite and positive', { boundaryWidth });
  }
  if (polygons.length === 0) return [];
  const origin = polygons.find((polygon) => polygon.length > 0)?.[0];
  if (!origin) return [];
  const scale = SUBDIVISIONS / boundaryWidth;
  const paths = polygons.map((polygon) => polygon.map(([x, y]) => ({
    x: Math.round((x - origin[0]) * scale),
    y: Math.round((y - origin[1]) * scale),
  })));
  const region = union(paths, [], FillRule.NonZero);
  const interior = inflatePaths(region, -SUBDIVISIONS / 2, JoinType.Miter, EndType.Polygon, 2);
  if (!interior.some((path) => area(path) > 0)) return [];
  return interior.filter((path) => area(path) !== 0).map((path) => path.map(({ x, y }) => [
    origin[0] + x / scale,
    origin[1] + y / scale,
  ]));
}
