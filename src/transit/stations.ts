/**
 * The shape of a station: a straight platform box along its track, and, when
 * the platform is below grade, one shaft per street entrance running from the
 * sidewalk down to platform level with a passage from its foot to the platform.
 * All plan geometry; heights come from the levels the station and the ground
 * plane publish.
 */
import type { Polygon, Shaft, Vec2 } from '../../schema/blueprint';
import { add, closestOnSegment, dist, normalize, perp, scale, sub } from '../geom/vec';
import { centroid, pointInPolygon } from '../geom/polygon';
import { LEVELS } from '../levels';

/**
 * Station dimensions, meters (docs/RESEARCH.md). A metro box holds a six-car
 * train on an island platform; a regional platform is longer and narrower.
 * The shaft is a stair box on the sidewalk, the passage an egress corridor.
 */
export const STATION = {
  subway: { platformLength: 140, platformWidth: 8 },
  train: { platformLength: 180, platformWidth: 6 },
  /** Stair box down from the sidewalk: this long along the street, this wide where the sidewalk allows. */
  shaft: { length: 8, maxWidth: 3, minWidth: 1.6 },
  /** Corridor from a shaft foot to the platform. */
  passageWidth: 4,
  /**
   * Longest passage from an entrance to its platform. NFPA 130 caps the walk
   * from the platform's most remote point to the street at 100 m; half a 140 m
   * platform is 70 of those, so the passage keeps the rest.
   */
  maxPassage: 30,
} as const;

/** A street entrance: where it stands, which way its street runs, how much sidewalk it has. */
export interface EntrancePlace {
  point: Vec2;
  direction: Vec2;
  sidewalk: number;
}

/** A rectangle centred on `center`, `length` along `direction` and `width` across it, CCW. */
export function rectangle(center: Vec2, direction: Vec2, length: number, width: number): Polygon {
  const u = scale(normalize(direction), length / 2);
  const v = scale(perp(normalize(direction)), width / 2);
  return [
    sub(sub(center, u), v),
    add(sub(center, v), u),
    add(add(center, u), v),
    sub(add(center, v), u),
  ];
}

/** The platform box of a station on this track direction. */
export function platformOf(position: Vec2, direction: Vec2, mode: 'subway' | 'train'): Polygon {
  const { platformLength, platformWidth } = STATION[mode];
  return rectangle(position, direction, platformLength, platformWidth);
}

/**
 * One shaft per entrance. A station at grade publishes none: its entrances open
 * straight onto the platform.
 */
export function shaftsOf(entrances: readonly EntrancePlace[], platform: Polygon, level: number): Shaft[] {
  if (level >= LEVELS.ground) return [];
  return entrances.map((e) => {
    const width = Math.min(STATION.shaft.maxWidth, Math.max(STATION.shaft.minWidth, e.sidewalk - 0.3));
    const footprint = rectangle(e.point, e.direction, STATION.shaft.length, width);
    return { footprint, top: LEVELS.ground, bottom: level, passage: passageTo(e.point, platform) };
  });
}

/**
 * The corridor from a shaft foot to the platform: a straight box reaching from
 * the entrance to well inside the platform. Empty when the shaft already lands
 * on the platform.
 */
function passageTo(from: Vec2, platform: Polygon): Polygon {
  if (pointInPolygon(from, platform)) return [];
  const target = deepestReachIn(from, platform);
  const span = dist(from, target);
  const direction = normalize(sub(target, from));
  return rectangle(add(from, scale(direction, span / 2)), direction, span, STATION.passageWidth);
}

/** The point on the platform's far side of the nearest edge: the corridor ends inside, not on the wall. */
function deepestReachIn(from: Vec2, platform: Polygon): Vec2 {
  let best: Vec2 = platform[0];
  let bestDistance = Infinity;
  for (let i = 0; i < platform.length; i++) {
    const { point } = closestOnSegment(from, platform[i], platform[(i + 1) % platform.length]);
    const d = dist(from, point);
    if (d < bestDistance) {
      bestDistance = d;
      best = point;
    }
  }
  const inward = normalize(sub(centroid(platform), best));
  return add(best, scale(inward, STATION.passageWidth));
}
