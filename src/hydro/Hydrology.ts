import { AtlasError } from '../errors';
import type {
  HydroPoint,
  HydroPolygon,
  HydrologyCrossingInput,
  HydrologyPlan,
  HydrologyParams,
  HydrologyRequest,
  HydrologyType,
  WaterStructure,
} from './types';

const TYPES: HydrologyType[] = ['lagoon', 'river', 'sea-coast'];
const MIN_EXTENT = 420;
const SHORE_WIDTH = 6;
const SNAP = 1000;

/** Builds the water reservation before city infrastructure is placed. */
export function planHydrology(request: HydrologyRequest): HydrologyPlan | null {
  validateRequest(request);
  if (!request.config) return null;
  const { width, depth } = request.size;
  if (Math.min(width, depth) < MIN_EXTENT) {
    throw new AtlasError(
      'E_UNSATISFIABLE',
      `hydrology needs a city extent of at least ${MIN_EXTENT} m`,
      { field: 'hydrology', minExtent: MIN_EXTENT },
    );
  }
  const type = request.config.type;
  const identity = hash32(`${String(request.seed)}\0hydrology\0${type}`);
  const surface = type === 'lagoon'
    ? lagoon(width, depth, identity)
    : type === 'river'
      ? river(width, depth, identity)
      : coast(width, depth, identity);
  const body = {
    id: 'w0',
    type,
    surfaces: [surface],
    shorelines: [{ id: 'sh0', path: surface.map(copyPoint), closed: true as const, band: shorelineBand(surface, SHORE_WIDTH) }],
    elevation: -0.35,
    depth: type === 'lagoon' ? 6 : type === 'river' ? 8 : 30,
    materialKey: `water.${type}` as const,
  };
  return {
    seedId: `hydro-${identity.toString(16).padStart(8, '0')}`,
    type,
    bodies: [body],
    structures: [],
  };
}

/** Adds explicit bridge or tunnel records for every network portion crossing water. */
export function withHydrologyStructures(
  plan: HydrologyPlan | null,
  crossings: readonly HydrologyCrossingInput[],
): HydrologyPlan | null {
  if (!plan) return null;
  const structures: WaterStructure[] = [];
  const ordered = [...crossings].sort((a, b) => a.network.localeCompare(b.network) || a.refId.localeCompare(b.refId));
  for (const crossing of ordered) {
    if (crossing.path.length < 2 || !crossing.path.every(validPoint) || !(crossing.width > 0) || !Number.isFinite(crossing.level)) {
      throw new AtlasError('E_INVARIANT', `invalid hydrology crossing input ${crossing.network}:${crossing.refId}`);
    }
    for (const body of plan.bodies) {
      for (const surface of body.surfaces) {
        const contact = offsetRing(surface, crossing.width / 2);
        for (const path of pathsInside(crossing.path, contact)) {
          structures.push({
            id: `ws${structures.length}`,
            kind: crossing.network === 'subway' || crossing.level < body.elevation ? 'tunnel' : 'bridge',
            network: crossing.network,
            refId: crossing.refId,
            waterBodyId: body.id,
            path,
            width: crossing.width,
            level: crossing.level,
          });
        }
      }
    }
  }
  return { ...plan, structures };
}

function validateRequest(request: HydrologyRequest): void {
  if (!request || typeof request !== 'object') throw invalid('hydrology request must be an object');
  if ((typeof request.seed !== 'string' && typeof request.seed !== 'number')
    || (typeof request.seed === 'number' && !Number.isFinite(request.seed))) throw invalid('hydrology seed must be a string or finite number');
  if (!request.size || !Number.isFinite(request.size.width) || !Number.isFinite(request.size.depth)
    || request.size.width <= 0 || request.size.depth <= 0) throw invalid('hydrology size must contain positive finite width and depth');
  if (!Array.isArray(request.boundary) || request.boundary.length < 3 || !request.boundary.every(validPoint)) {
    throw invalid('hydrology boundary must be a finite polygon');
  }
  if (request.config === undefined) return;
  validateHydrologyParams(request.config);
}

/** Runtime validation shared by Atlas parameter resolution and this boundary. */
export function validateHydrologyParams(value: unknown): asserts value is HydrologyParams {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => key !== 'type')
    || !TYPES.includes((value as HydrologyParams).type)) throw invalid('hydrology.type must be lagoon, river, or sea-coast');
}

function lagoon(width: number, depth: number, identity: number): HydroPolygon {
  const phase = fraction(identity ^ 0x9e3779b9) * Math.PI * 2;
  const cx = width * (0.5 + (fraction(identity) - 0.5) * 0.08);
  const cz = depth * (0.5 + (fraction(identity ^ 0x85ebca6b) - 0.5) * 0.08);
  const rx = width * (0.1 + fraction(identity ^ 0xc2b2ae35) * 0.025);
  const rz = depth * (0.075 + fraction(identity ^ 0x27d4eb2f) * 0.02);
  return ring(32, (angle) => [cx + rx * Math.cos(angle + phase), cz + rz * Math.sin(angle + phase)]);
}

function river(width: number, depth: number, identity: number): HydroPolygon {
  const vertical = (identity & 1) === 0;
  const long = vertical ? depth : width;
  const across = vertical ? width : depth;
  const center = across * (0.43 + fraction(identity ^ 0x165667b1) * 0.14);
  const half = Math.min(width, depth) * (0.028 + fraction(identity ^ 0xd3a2646c) * 0.008);
  const amplitude = half * 0.42;
  const phase = fraction(identity ^ 0xfd7046c5) * Math.PI * 2;
  const left: HydroPoint[] = [];
  const right: HydroPoint[] = [];
  for (let index = 0; index <= 16; index++) {
    const along = (long * index) / 16;
    const bend = Math.sin((index / 16) * Math.PI * 2 + phase) * amplitude;
    const a = center + bend;
    const lo = a - half;
    const hi = a + half;
    left.push(vertical ? point(lo, along) : point(along, lo));
    right.push(vertical ? point(hi, along) : point(along, hi));
  }
  return ensureCCW([...left, ...right.reverse()]);
}

function coast(width: number, depth: number, identity: number): HydroPolygon {
  const side = identity % 4;
  const vertical = side < 2;
  const long = vertical ? depth : width;
  const across = vertical ? width : depth;
  const extent = across * (0.17 + fraction(identity ^ 0x94d049bb) * 0.04);
  const amplitude = across * 0.018;
  const phase = fraction(identity ^ 0x369dea0f) * Math.PI * 2;
  const shore: HydroPoint[] = [];
  for (let index = 0; index <= 20; index++) {
    const along = (long * index) / 20;
    const inset = extent + Math.sin((index / 20) * Math.PI * 3 + phase) * amplitude;
    const acrossAt = side === 0 || side === 2 ? inset : across - inset;
    shore.push(vertical ? point(acrossAt, along) : point(along, acrossAt));
  }
  let surface: HydroPolygon;
  if (side === 0) surface = [point(0, 0), ...shore, point(0, depth)];
  else if (side === 1) surface = [point(width, 0), point(width, depth), ...shore.reverse()];
  else if (side === 2) surface = [point(0, 0), point(width, 0), ...shore.reverse()];
  else surface = [point(0, depth), ...shore, point(width, depth)];
  return ensureCCW(removeRepeats(surface));
}

function shorelineBand(surface: HydroPolygon, width: number): HydroPolygon[] {
  const strips: HydroPolygon[] = [];
  for (let index = 0; index < surface.length; index++) {
    const a = surface[index];
    const b = surface[(index + 1) % surface.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 1e-9) continue;
    const nx = -dz / length;
    const nz = dx / length;
    strips.push(ensureCCW([
      copyPoint(a), copyPoint(b), point(b[0] + nx * width, b[1] + nz * width), point(a[0] + nx * width, a[1] + nz * width),
    ]));
  }
  return strips;
}

/** Deterministic mitered clearance ring for classifying a full-width corridor. */
function offsetRing(surface: HydroPolygon, amount: number): HydroPolygon {
  const out: HydroPolygon = [];
  for (let index = 0; index < surface.length; index++) {
    const before = surface[(index - 1 + surface.length) % surface.length];
    const at = surface[index];
    const after = surface[(index + 1) % surface.length];
    const incoming = unit(at[0] - before[0], at[1] - before[1]);
    const outgoing = unit(after[0] - at[0], after[1] - at[1]);
    const n1: HydroPoint = [incoming[1], -incoming[0]];
    const n2: HydroPoint = [outgoing[1], -outgoing[0]];
    const mx = n1[0] + n2[0];
    const mz = n1[1] + n2[1];
    const denominator = mx * n2[0] + mz * n2[1];
    const scale = Math.abs(denominator) > 1e-6 ? Math.min(amount / denominator, amount * 4) : amount;
    out.push(point(at[0] + mx * scale, at[1] + mz * scale));
  }
  return ensureCCW(out);
}

function pathsInside(path: HydroPoint[], polygon: HydroPolygon): HydroPoint[][] {
  const out: HydroPoint[][] = [];
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1];
    const b = path[index];
    const cuts = [0, 1];
    for (let edge = 0; edge < polygon.length; edge++) {
      const t = intersectionParameter(a, b, polygon[edge], polygon[(edge + 1) % polygon.length]);
      if (t !== null && t > 1e-9 && t < 1 - 1e-9) cuts.push(t);
    }
    cuts.sort((left, right) => left - right);
    const unique = cuts.filter((value, cut) => cut === 0 || Math.abs(value - cuts[cut - 1]) > 1e-9);
    for (let cut = 1; cut < unique.length; cut++) {
      const from = unique[cut - 1];
      const to = unique[cut];
      if (!contains(polygon, interpolate(a, b, (from + to) / 2))) continue;
      const segment = [interpolate(a, b, from), interpolate(a, b, to)];
      const previous = out.at(-1);
      if (previous && samePoint(previous.at(-1)!, segment[0])) previous.push(segment[1]);
      else out.push(segment);
    }
  }
  return out.filter((segment) => segment.length >= 2 && pathLength(segment) > 1e-6);
}

function intersectionParameter(a: HydroPoint, b: HydroPoint, c: HydroPoint, d: HydroPoint): number | null {
  const rx = b[0] - a[0];
  const rz = b[1] - a[1];
  const sx = d[0] - c[0];
  const sz = d[1] - c[1];
  const denominator = rx * sz - rz * sx;
  if (Math.abs(denominator) < 1e-12) return null;
  const qx = c[0] - a[0];
  const qz = c[1] - a[1];
  const t = (qx * sz - qz * sx) / denominator;
  const u = (qx * rz - qz * rx) / denominator;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? t : null;
}

function contains(polygon: HydroPolygon, target: HydroPoint): boolean {
  let inside = false;
  for (let index = 0, before = polygon.length - 1; index < polygon.length; before = index++) {
    const a = polygon[index];
    const b = polygon[before];
    if ((a[1] > target[1]) !== (b[1] > target[1])
      && target[0] < ((b[0] - a[0]) * (target[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function ring(count: number, at: (angle: number) => HydroPoint): HydroPolygon {
  return ensureCCW(Array.from({ length: count }, (_, index) => point(...at((index / count) * Math.PI * 2))));
}

function ensureCCW(polygon: HydroPolygon): HydroPolygon {
  return signedArea(polygon) >= 0 ? polygon : [...polygon].reverse();
}

function signedArea(polygon: HydroPolygon): number {
  let total = 0;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    total += a[0] * b[1] - b[0] * a[1];
  }
  return total / 2;
}

function removeRepeats(polygon: HydroPolygon): HydroPolygon {
  return polygon.filter((candidate, index) => index === 0 || !samePoint(candidate, polygon[index - 1]));
}

function validPoint(value: unknown): value is HydroPoint {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

function pathLength(path: HydroPoint[]): number {
  let total = 0;
  for (let index = 1; index < path.length; index++) total += Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]);
  return total;
}

function unit(x: number, z: number): HydroPoint {
  const length = Math.hypot(x, z);
  return length > 1e-9 ? [x / length, z / length] : [0, 0];
}

function interpolate(a: HydroPoint, b: HydroPoint, t: number): HydroPoint {
  return point(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
}

function samePoint(a: HydroPoint, b: HydroPoint): boolean {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

function point(x: number, z: number): HydroPoint {
  return [Math.round(x * SNAP) / SNAP, Math.round(z * SNAP) / SNAP];
}

function copyPoint(value: HydroPoint): HydroPoint {
  return [value[0], value[1]];
}

function fraction(value: number): number {
  return (value >>> 0) / 0x100000000;
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function invalid(message: string): AtlasError {
  return new AtlasError('E_INVALID_PARAMS', message, { field: 'hydrology' });
}
