import { AtlasError } from '../errors';
import type { HydroPoint, HydroPolygon, HydrologyPlan } from './types';

const TYPES = new Set(['lagoon', 'river', 'sea-coast']);
const MATERIALS = new Set(['water.lagoon', 'water.river', 'water.sea-coast']);

/** Fail-closed semantic checks for the hydrology output contract. */
export function checkHydrology(plan: HydrologyPlan, size: { width: number; depth: number }): void {
  if (!/^hydro-[0-9a-f]{8}$/.test(plan.seedId) || !TYPES.has(plan.type) || plan.bodies.length === 0) fail('invalid hydrology identity');
  const ids = new Set<string>();
  for (const body of plan.bodies) {
    claim(ids, body.id);
    if (body.type !== plan.type || !MATERIALS.has(body.materialKey) || !Number.isFinite(body.elevation) || !(body.depth > 0)) fail(`invalid water body ${body.id}`);
    if (body.surfaces.length === 0 || body.shorelines.length !== body.surfaces.length) fail(`water body ${body.id} has unmatched surfaces and shorelines`);
    body.surfaces.forEach((surface, index) => {
      if (!simpleRing(surface) || !insideBounds(surface, size)) fail(`water body ${body.id} has an invalid or unbounded surface`);
      const shoreline = body.shorelines[index];
      claim(ids, shoreline.id);
      if (!shoreline.closed || !sameRing(surface, shoreline.path) || !simpleRing(shoreline.path)) fail(`shoreline ${shoreline.id} is not watertight`);
      if (shoreline.band.length !== shoreline.path.length || shoreline.band.some((piece) => !simpleRing(piece))) fail(`shoreline ${shoreline.id} has an invalid band`);
    });
  }
  for (const structure of plan.structures) {
    claim(ids, structure.id);
    if (!['bridge', 'tunnel'].includes(structure.kind) || !['street', 'train', 'subway'].includes(structure.network)
      || !plan.bodies.some((body) => body.id === structure.waterBodyId)
      || structure.path.length < 2 || !structure.path.every(validPoint) || !(structure.width > 0)
      || !Number.isFinite(structure.level)) fail(`invalid water structure ${structure.id}`);
  }
}

function claim(ids: Set<string>, id: string): void {
  if (!id || ids.has(id)) fail(`duplicate hydrology id ${id}`);
  ids.add(id);
}

function insideBounds(polygon: HydroPolygon, size: { width: number; depth: number }): boolean {
  return polygon.every(([x, z]) => x >= -1e-9 && z >= -1e-9 && x <= size.width + 1e-9 && z <= size.depth + 1e-9);
}

function sameRing(left: HydroPolygon, right: HydroPolygon): boolean {
  return left.length === right.length && left.every((point, index) => samePoint(point, right[index]));
}

function simpleRing(polygon: HydroPolygon): boolean {
  if (polygon.length < 3 || Math.abs(signedArea(polygon)) <= 1e-9 || !polygon.every(validPoint)) return false;
  for (let a = 0; a < polygon.length; a++) {
    for (let b = a + 2; b < polygon.length; b++) {
      if (a === 0 && b === polygon.length - 1) continue;
      if (crosses(polygon[a], polygon[(a + 1) % polygon.length], polygon[b], polygon[(b + 1) % polygon.length])) return false;
    }
  }
  return true;
}

function crosses(a: HydroPoint, b: HydroPoint, c: HydroPoint, d: HydroPoint): boolean {
  const side = (p: HydroPoint, q: HydroPoint, r: HydroPoint): number => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return side(c, d, a) * side(c, d, b) < 0 && side(a, b, c) * side(a, b, d) < 0;
}

function signedArea(polygon: HydroPolygon): number {
  return polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function validPoint(value: unknown): value is HydroPoint {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

function samePoint(left: HydroPoint, right: HydroPoint): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function fail(message: string): never {
  throw new AtlasError('E_INVARIANT', message);
}
