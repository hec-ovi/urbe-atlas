import type { Vec2 } from '../../../schema/blueprint';
import { snap, snapPoint, union } from '../../geom/clip';
import { add, normalize, perp, scale, sub } from '../../geom/vec';
import { sidewalkBand, type StreetSide } from '../../streets/construction/SidewalkSection';
import type { SectionedStreetEdge } from '../../streets/construction/schema/sections';
import { rectangle, STATION } from '../stations';
import type { BayPlace } from './schema';

export const BAY_APRON = 1;
export const BAY_LENGTH = STATION.shaft.length + BAY_APRON * 2;

export function bayCenter(edge: SectionedStreetEdge, side: StreetSide, point: Vec2, direction: Vec2): Vec2 {
  const normal = scale(perp(normalize(direction)), side === 'left' ? 1 : -1);
  return snapPoint(add(point, scale(normal, edge.width / 2 + edge.sidewalk[side] + STATION.shaft.width / 2 + BAY_APRON)));
}

/** A complete stair box and its connection, expressed from one directed street segment. */
export function bayAt(edge: SectionedStreetEdge, side: StreetSide, point: Vec2, direction: Vec2, distance: number): BayPlace {
  const sign = side === 'left' ? 1 : -1;
  const normal = scale(perp(normalize(direction)), sign);
  const depth = STATION.shaft.width + BAY_APRON * 2;
  const center = bayCenter(edge, side, point, direction);
  const walking = sidewalkBand(edge, side, 'walking');
  const connection = snapPoint(add(point, scale(normal, edge.width / 2 + walking.offset)));
  const shaft = rectangle(center, direction, STATION.shaft.length, STATION.shaft.width).map(snapPoint);
  const apron = rectangle(center, direction, BAY_LENGTH, depth).map(snapPoint);
  const connectorLength = Math.hypot(center[0] - connection[0], center[1] - connection[1]);
  const connector = rectangle(add(connection, scale(sub(center, connection), 0.5)), normal, connectorLength, STATION.shaft.width).map(snapPoint);
  const footprint = union([apron, connector])[0];
  return {
    point: center,
    direction: normalize(direction),
    bay: { edgeId: edge.id, side, distance: snap(distance), footprint, shaft, approach: [connection, center] },
  };
}
