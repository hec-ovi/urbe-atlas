import type { HighwayStructure, Polygon, Polyline, Vec2 } from '../../../../schema/blueprint';
import { invariantFailure } from '../../../errors';
import { intersection, snapPoint } from '../../../geom/clip';
import { area, bounds } from '../../../geom/polygon';
import { directionAt, length as pathLength, pointAt } from '../../../geom/polyline';
import { add, scale } from '../../../geom/vec';
import { LEVELS } from '../../../levels';
import { HIGHWAY_DECK } from './dimensions';
import type { HighwayEnvelope } from './schema';

type Obstacle = { polygon: Polygon; box: ReturnType<typeof bounds> };

/** Adds columns to the supplied envelope without altering its construction plan. */
export function supportHighwayEnvelopes(
  envelopes: readonly HighwayEnvelope[],
  gradeObstacles: readonly Polygon[] = [],
): HighwayStructure[] {
  const obstacles = gradeObstacles.map((polygon) => ({ polygon, box: bounds(polygon) }));
  return envelopes.map((envelope) => {
    const supports = [];
    const flatStart = envelope.ramps.start;
    const flatEnd = pathLength(envelope.path) - envelope.ramps.end;
    let previousAlong = flatStart;
    let targetAlong = flatStart + HIGHWAY_DECK.supportPitch / 2;
    while (targetAlong < flatEnd) {
      // Moving this pitch backward also moves the following pitches, retaining
      // the maximum supported span while avoiding the intervening obstacle.
      let along = targetAlong;
      let support = clearSupportAt(envelope, along, obstacles);
      while (!support && along > previousAlong + 1) {
        along -= 1;
        support = clearSupportAt(envelope, along, obstacles);
      }
      if (!support) {
        throw invariantFailure(`highway ${envelope.edgeIds[0]} cannot place a support clear of grade infrastructure`);
      }
      supports.push(support);
      previousAlong = along;
      targetAlong = along + HIGHWAY_DECK.supportPitch;
    }
    return { ...envelope, supports };
  });
}

function clearSupportAt(
  envelope: HighwayEnvelope,
  along: number,
  obstacles: readonly Obstacle[],
): HighwayStructure['supports'][number] | null {
  const center = pointAt(envelope.path, along);
  const direction = directionAt(envelope.path, along);
  const side: Vec2 = [-direction[1], direction[0]];
  const lateral = Math.max(0, envelope.width / 2 - HIGHWAY_DECK.supportSize / 2 - 0.5);
  for (const offset of [0, lateral, -lateral]) {
    const position = snapPoint(add(center, scale(side, offset)));
    const half = HIGHWAY_DECK.supportSize / 2;
    const footprint: Polygon = [
      [position[0] - half, position[1] - half],
      [position[0] + half, position[1] - half],
      [position[0] + half, position[1] + half],
      [position[0] - half, position[1] + half],
    ];
    if (!hitsAny(footprint, obstacles)) {
      return { position, footprint, bottom: LEVELS.ground, top: envelope.level - envelope.deckThickness };
    }
  }
  return null;
}

function hitsAny(footprint: Polyline, obstacles: readonly Obstacle[]): boolean {
  const box = bounds(footprint);
  return obstacles.some((obstacle) => {
    if (obstacle.box.min[0] >= box.max[0] || obstacle.box.max[0] <= box.min[0]
      || obstacle.box.min[1] >= box.max[1] || obstacle.box.max[1] <= box.min[1]) return false;
    return intersection([footprint], [obstacle.polygon]).reduce((sum, polygon) => sum + area(polygon), 0) > 1e-6;
  });
}
