/**
 * Street furniture is placed, not scattered: every signal head belongs to an
 * arm of its junction and hangs over that arm's roadway, every planting point
 * stands in a sidewalk band, and nothing stands where a person already walks.
 */
import type { CityBlueprint, StreetEdge, Vec2 } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { distanceTo } from '../geom/polyline';
import { Obstacles, PLANTING_CLEARANCE } from '../streets/Planting';

/** Unit vectors and right angles are exact enough at this tolerance. */
const EPS = 1e-6;

/** Distance from the centerline that lands inside the edge's ground, kerb and sidewalk included. */
function inBand(edge: StreetEdge, point: Vec2, slack: number): boolean {
  const d = distanceTo(edge.path, point);
  return d >= edge.width / 2 - slack && d <= edge.width / 2 + Math.max(edge.sidewalk.left, edge.sidewalk.right) + slack;
}

export function checkFurniture(bp: CityBlueprint): void {
  const edgeById = new Map(bp.streets.edges.map((e) => [e.id, e]));
  const nodeById = new Map(bp.streets.nodes.map((n) => [n.id, n]));

  for (const signal of bp.streets.signals) {
    const node = nodeById.get(signal.nodeId);
    const edge = edgeById.get(signal.edgeId);
    if (!node || !edge) throw invariantFailure(`signal at ${signal.nodeId} references a missing node or edge`);
    if (!node.edgeIds.includes(signal.edgeId)) {
      throw invariantFailure(`signal at ${signal.nodeId} governs ${signal.edgeId}, which is not one of its arms`);
    }
    for (const [name, v] of [['facing', signal.facing], ['mast', signal.mast.direction]] as [string, Vec2][]) {
      if (Math.abs(Math.hypot(v[0], v[1]) - 1) > EPS) {
        throw invariantFailure(`signal at ${signal.nodeId} has a ${name} that is not a unit direction`);
      }
    }
    // the mast reaches across the arm it stops, so it is square to what the head looks at
    const square = signal.facing[0] * signal.mast.direction[0] + signal.facing[1] * signal.mast.direction[1];
    if (Math.abs(square) > EPS) {
      throw invariantFailure(`signal at ${signal.nodeId} has a mast that is not square to its facing`);
    }
    if (signal.mast.length <= 0) throw invariantFailure(`signal at ${signal.nodeId} has a mast of no length`);
    if (!inBand(edge, signal.position, 0.5)) {
      throw invariantFailure(`signal at ${signal.nodeId} does not stand on the sidewalk of ${signal.edgeId}`);
    }
  }

  const clear = new Obstacles();
  clear.add(bp.streets.crossings.flatMap((c) => c.segments.flatMap((s) => [s.from, s.to])));
  clear.add(bp.transit.busStops.map((s) => s.position));
  clear.add([...bp.transit.trainStations, ...bp.transit.subwayStations].flatMap((s) => s.entrances));
  clear.add(bp.parcels.map((p) => p.access.point));
  for (const point of bp.streets.planting) {
    const edge = edgeById.get(point.edgeId);
    if (!edge) throw invariantFailure(`planting point references missing edge ${point.edgeId}`);
    if (!inBand(edge, point.position, 0.5)) {
      throw invariantFailure(`planting point on ${point.edgeId} is not on its sidewalk band`, { position: point.position });
    }
    if (clear.blocks(point.position)) {
      throw invariantFailure(`planting point on ${point.edgeId} stands within ${PLANTING_CLEARANCE} m of a way in`, {
        position: point.position,
      });
    }
  }
}
