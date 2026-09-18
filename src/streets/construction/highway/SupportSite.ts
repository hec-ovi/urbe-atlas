import type { HighwayStructure, Polygon, Polyline, Vec2 } from '../../../../schema/blueprint';
import { intersection, snapPoint } from '../../../geom/clip';
import { area, bounds } from '../../../geom/polygon';
import { directionAt, pointAt } from '../../../geom/polyline';
import { add, scale } from '../../../geom/vec';
import { LEVELS } from '../../../levels';
import { HIGHWAY_DECK } from './dimensions';
import { lateralOffsets } from './SupportStations';
import type { SupportObstacle } from './SupportStations';
import type { HighwayEnvelope } from './schema';

export type Support = HighwayStructure['supports'][number];

/** The column standing at this station, or null when every lateral offset is blocked. */
export function clearSupportAt(
  envelope: HighwayEnvelope,
  along: number,
  obstacles: readonly SupportObstacle[],
): Support | null {
  const center = pointAt(envelope.path, along);
  const direction = directionAt(envelope.path, along);
  const side: Vec2 = [-direction[1], direction[0]];
  for (const offset of lateralOffsets(envelope)) {
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

function hitsAny(footprint: Polyline, obstacles: readonly SupportObstacle[]): boolean {
  const box = bounds(footprint);
  return obstacles.some((obstacle) => {
    if (obstacle.box.min[0] >= box.max[0] || obstacle.box.max[0] <= box.min[0]
      || obstacle.box.min[1] >= box.max[1] || obstacle.box.max[1] <= box.min[1]) return false;
    return intersection([footprint], [obstacle.polygon]).reduce((sum, polygon) => sum + area(polygon), 0) > 1e-6;
  });
}
