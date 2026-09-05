import { EndType, FillRule, JoinType, area, inflatePaths, union } from 'clipper2-ts';
import { invariantFailure } from '../errors';
import type { Polygon } from './schema';

const SUBDIVISIONS = 1024;

/** A diagnostic region never re-enters the published coordinate representation. */
export function interiorBeyondPrecision(polygons: Polygon[], boundaryWidth: number): boolean {
  if (!Number.isFinite(boundaryWidth) || boundaryWidth <= 0) {
    throw invariantFailure('polygon diagnostic boundary width must be finite and positive', { boundaryWidth });
  }
  if (polygons.length === 0) return false;
  const origin = polygons.find((polygon) => polygon.length > 0)?.[0];
  if (!origin) return false;
  const scale = SUBDIVISIONS / boundaryWidth;
  const paths = polygons.map((polygon) => polygon.map(([x, y]) => ({
    x: Math.round((x - origin[0]) * scale),
    y: Math.round((y - origin[1]) * scale),
  })));
  const region = union(paths, [], FillRule.NonZero);
  const interior = inflatePaths(region, -SUBDIVISIONS / 2, JoinType.Miter, EndType.Polygon, 2);
  return interior.some((path) => area(path) > 0);
}
