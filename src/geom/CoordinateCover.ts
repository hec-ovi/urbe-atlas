import { invariantFailure } from '../errors';
import { winding } from './orientation';
import type { Polygon, Vec2 } from './schema';

function copyRing(polygon: Polygon): Polygon {
  if (polygon.length < 3 || polygon.some(point => point.length !== 2 || point.some(value => !Number.isFinite(value)))) {
    throw invariantFailure('coordinate cover requires finite polygon rings');
  }
  const copy: Polygon = polygon.map(([x, y]) => [x, y]);
  const sign = winding(copy);
  if (sign === 0 || copy.some((point, index) => {
    const next = copy[(index + 1) % copy.length];
    return point[0] === next[0] && point[1] === next[1];
  })) throw invariantFailure('coordinate cover requires nondegenerate unclosed rings');
  return sign > 0 ? copy : copy.reverse();
}

const shifted = (point: Vec2, delta: Vec2): Vec2 => [point[0] + delta[0], point[1] + delta[1]];
const same = (a: Vec2, b: Vec2): boolean => a[0] === b[0] && a[1] === b[1];

function appendMask(result: Polygon[], points: Polygon): void {
  const ring = points.filter((point, index) => !same(point, points[(index + points.length - 1) % points.length]));
  if (ring.length < 3) return;
  const sign = winding(ring);
  if (sign !== 0) result.push(sign > 0 ? ring : ring.reverse());
}

/** Copied source masks and bounded diagnostic edge/corner additions, without a Boolean or snap. */
export function coordinateCover(polygons: readonly Polygon[], grid: number): Polygon[] {
  if (!Number.isFinite(grid) || grid <= 0) {
    throw invariantFailure('coordinate cover grid must be finite and positive', { grid });
  }
  const result: Polygon[] = [];
  const distance = grid / Math.SQRT2;
  for (const polygon of polygons) {
    const ring = copyRing(polygon);
    result.push(ring);
    const offsets = ring.map((a, index): Vec2 => {
      const b = ring[(index + 1) % ring.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
      return [distance * (dy / length), -distance * (dx / length)];
    });
    for (let index = 0; index < ring.length; index++) {
      const a = ring[index], b = ring[(index + 1) % ring.length];
      const outsideA = shifted(a, offsets[index]), outsideB = shifted(b, offsets[index]);
      appendMask(result, [[...a], outsideA, outsideB, [...b]]);
      const previous = shifted(a, offsets[(index + ring.length - 1) % ring.length]);
      appendMask(result, [[...a], previous, [...outsideA]]);
    }
  }
  return result;
}
