/**
 * The shape of a station: a straight platform box along its track, and, when
 * the platform is below grade, one shaft per street entrance running from the
 * sidewalk down to platform level with a passage from its foot to the platform.
 * All plan geometry; heights come from the levels the station and the ground
 * plane publish.
 */
import type { Polygon, Shaft, StationAccessPath, Vec2, Vec3 } from '../../schema/blueprint';
import { add, closestOnSegment, dist, normalize, perp, scale, sub } from '../geom/vec';
import { centroid, pointInPolygon } from '../geom/polygon';
import { LEVELS } from '../levels';

/**
 * Station dimensions, meters (docs/RESEARCH.md). A metro box holds a six-car
 * train on an island platform; a regional platform is longer and narrower.
 * The shaft is a stair box on the sidewalk, the passage an egress corridor.
 */
export const STATION = {
  /** `height` is the clear volume over the platform, the box a tunnel must miss. */
  subway: { platformLength: 140, platformWidth: 8, height: 5 },
  train: { platformLength: 180, platformWidth: 6, height: 3 },
  /** Stair box down from the sidewalk: this long along the street, this wide where the sidewalk allows. */
  shaft: { length: 8, maxWidth: 3, minWidth: 1.6 },
  /** Half-run of the switchback stair centerline inside the shaft. */
  stairRun: 3,
  /** Corridor from a shaft foot to the platform. */
  passageWidth: 4,
  /**
   * Longest passage from an entrance to its platform. NFPA 130 caps the walk
   * from the platform's most remote point to the street at 100 m; half a 140 m
   * platform is 70 of those, so the passage keeps the rest.
   */
  maxPassage: 30,
} as const;

/** Rail corridor dimensions shared by generation, validation and previews. */
export const RAIL = {
  trainWidth: 4,
  subwayDiameter: 6,
  buildingClearance: 1,
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

/** The platform footprint of a station on this track direction. */
export function platformOf(position: Vec2, direction: Vec2, mode: StationMode): Polygon {
  const { platformLength, platformWidth } = STATION[mode];
  return rectangle(position, direction, platformLength, platformWidth);
}

/** The volume over that footprint: platform floor to ceiling. */
export function boxOf(level: number, mode: StationMode): { bottom: number; top: number } {
  return { bottom: level, top: level + STATION[mode].height };
}

/** Underground metro or regional rail at grade: the two shapes a station takes. */
export type StationMode = 'subway' | 'train';

/**
 * Construction volume and explicit traversal share the same anchors. The
 * switchback centerline descends inside the shaft and hands off to a level
 * passage ending inside the platform.
 */
export function stationAccessOf(
  entrances: readonly EntrancePlace[],
  platform: Polygon,
  level: number,
): { shafts: Shaft[]; accessPaths: StationAccessPath[] } {
  if (level >= LEVELS.ground) return { shafts: [], accessPaths: [] };
  const shafts: Shaft[] = [];
  const accessPaths: StationAccessPath[] = [];
  entrances.forEach((e, entranceIndex) => {
    const width = Math.min(STATION.shaft.maxWidth, Math.max(STATION.shaft.minWidth, e.sidewalk - 0.3));
    const footprint = rectangle(e.point, e.direction, STATION.shaft.length, width);
    const handoff = pointInPolygon(e.point, platform) ? e.point : deepestReachIn(e.point, platform);
    const passage = pointInPolygon(e.point, platform) ? [] : passageBetween(e.point, handoff);
    shafts.push({ footprint, top: LEVELS.ground, bottom: level, passage });
    const stairPath = switchbackStairs(e.point, e.direction, level);
    const segments: StationAccessPath['segments'] = [{ kind: 'stairs', path: stairPath }];
    if (dist(e.point, handoff) > 1e-9) {
      segments.push({
        kind: 'passage',
        path: [point3(e.point, level), point3(handoff, level)],
      });
    }
    accessPaths.push({ entranceIndex, segments, platformHandoff: point3(handoff, level) });
  });
  return { shafts, accessPaths };
}

/** Four flights, all with the same 2:3 rise-to-run ratio at the default -12 m level. */
function switchbackStairs(center: Vec2, direction: Vec2, level: number): Vec3[] {
  const run = scale(normalize(direction), STATION.stairRun);
  return [
    point3(center, LEVELS.ground),
    point3(add(center, run), level / 6),
    point3(sub(center, run), level / 2),
    point3(add(center, run), (level * 5) / 6),
    point3(center, level),
  ];
}

function point3([x, z]: Vec2, y: number): Vec3 {
  return [x, y, z];
}

function passageBetween(from: Vec2, target: Vec2): Polygon {
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
