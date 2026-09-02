/** Contract checks for the published elevated-highway construction data. */
import type { CityBlueprint, HighwayStructure, Polygon, Vec2 } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { area, bounds, isSimpleRing } from '../geom/polygon';
import { bufferLine, intersection } from '../geom/clip';
import { distanceTo, length as pathLength } from '../geom/polyline';
import { dist, closestOnSegment } from '../geom/vec';
import { HIGHWAY_DECK, highwayElevationProfile } from '../streets/Highways';

const AREA_EPS = 1e-6;
const POSITION_EPS = 0.002;

export function checkHighwayStructures(bp: CityBlueprint): void {
  const highways = bp.streets.edges.filter((edge) => edge.class === 'highway');
  const edgeById = new Map(highways.map((edge) => [edge.id, edge]));
  const covered = new Set<string>();
  const pedestrianPaving = bp.volumetric.ground
    .filter((surface) => surface.surface === 'curb' || surface.surface === 'sidewalk')
    .map((surface) => ({ polygon: surface.polygon, box: bounds(surface.polygon) }));

  for (const structure of bp.streets.highwayStructures) {
    if (structure.edgeIds.length === 0 || structure.path.length < 2) {
      throw invariantFailure('highway structure has no run');
    }
    for (const id of structure.edgeIds) {
      const edge = edgeById.get(id);
      if (!edge) throw invariantFailure(`highway structure references non-highway edge ${id}`);
      if (covered.has(id)) throw invariantFailure(`highway edge ${id} belongs to more than one structure`);
      covered.add(id);
      if (Math.abs(edge.width - structure.width) > 1e-9 || Math.abs(edge.level - structure.level) > 1e-9) {
        throw invariantFailure(`highway structure dimensions disagree with edge ${id}`);
      }
    }
    checkRamps(structure);
    checkSupports(structure, pedestrianPaving);

    // The reserved deck corridor includes one meter of construction clearance
    // beyond each deck edge. A parcel entering it is a generator bug.
    const reservation = bufferLine(
      structure.path,
      structure.width + HIGHWAY_DECK.buildingClearance * 2,
    );
    const reservationBounds = reservation.map(bounds);
    for (const parcel of bp.parcels) {
      const box = bounds(parcel.footprint);
      if (!reservationBounds.some((reserved) =>
        reserved.min[0] < box.max[0] && reserved.max[0] > box.min[0]
        && reserved.min[1] < box.max[1] && reserved.max[1] > box.min[1])) continue;
      const overlap = intersection(reservation, [parcel.footprint]).reduce(
        (sum, polygon) => sum + area(polygon),
        0,
      );
      if (overlap > AREA_EPS) {
        throw invariantFailure(
          `highway ${structure.edgeIds[0]} violates the ${HIGHWAY_DECK.buildingClearance} m clearance of building ${parcel.id}`,
          { overlap },
        );
      }
    }
  }

  if (covered.size !== highways.length) {
    const missing = highways.find((edge) => !covered.has(edge.id));
    throw invariantFailure(`highway edge ${missing?.id ?? '?'} has no published structure`);
  }
}

function checkRamps(structure: HighwayStructure): void {
  const total = pathLength(structure.path);
  const { start, end } = structure.ramps;
  if (start < 0 || end < 0 || start + end > total + 1e-9) {
    throw invariantFailure(`highway ${structure.edgeIds[0]} has invalid ramp lengths`, { total, start, end });
  }
  if ((start > 0 || end > 0) && total - start - end < HIGHWAY_DECK.supportPitch - POSITION_EPS) {
    throw invariantFailure(`highway ${structure.edgeIds[0]} has no supportable flat deck`, { total, start, end });
  }
  if (structure.deckThickness <= 0 || structure.deckThickness >= structure.level) {
    throw invariantFailure(`highway ${structure.edgeIds[0]} has invalid deck thickness`);
  }
  const expected = highwayElevationProfile(total, structure.level, structure.ramps);
  if (JSON.stringify(structure.elevationProfile) !== JSON.stringify(expected)) {
    throw invariantFailure(`highway ${structure.edgeIds[0]} has an invalid elevation profile`);
  }
}

function checkSupports(
  structure: HighwayStructure,
  pedestrianPaving: readonly { polygon: Polygon; box: ReturnType<typeof bounds> }[],
): void {
  const flatStart = structure.ramps.start;
  const flatEnd = pathLength(structure.path) - structure.ramps.end;
  let previous = flatStart;
  for (const support of structure.supports) {
    if (!isSimpleRing(support.footprint)) {
      throw invariantFailure(`highway ${structure.edgeIds[0]} has an invalid support footprint`);
    }
    if (Math.abs(area(support.footprint) - HIGHWAY_DECK.supportSize ** 2) > 0.01) {
      throw invariantFailure(`highway ${structure.edgeIds[0]} has a support with the wrong size`);
    }
    const lateral = distanceTo(structure.path, support.position);
    if (lateral > structure.width / 2 - HIGHWAY_DECK.supportSize / 2 + POSITION_EPS) {
      throw invariantFailure(`highway ${structure.edgeIds[0]} has a support outside its deck`);
    }
    if (support.bottom !== 0 || Math.abs(support.top - (structure.level - structure.deckThickness)) > 1e-9) {
      throw invariantFailure(`highway ${structure.edgeIds[0]} has a floating support`);
    }
    for (const value of support.position) {
      if (Math.abs(value * 1000 - Math.round(value * 1000)) > 1e-7) {
        throw invariantFailure(`highway ${structure.edgeIds[0]} support is off the 1 mm grid`);
      }
    }
    const supportBox = bounds(support.footprint);
    for (const paved of pedestrianPaving) {
      if (paved.box.min[0] >= supportBox.max[0] || paved.box.max[0] <= supportBox.min[0]
        || paved.box.min[1] >= supportBox.max[1] || paved.box.max[1] <= supportBox.min[1]) continue;
      const overlap = intersection([support.footprint], [paved.polygon]).reduce((sum, polygon) => sum + area(polygon), 0);
      if (overlap > AREA_EPS) {
        throw invariantFailure(`highway ${structure.edgeIds[0]} support enters pedestrian paving`, { overlap });
      }
    }
    const along = distanceAlong(structure.path, support.position);
    if (along < flatStart - POSITION_EPS || along > flatEnd + POSITION_EPS) {
      throw invariantFailure(`highway ${structure.edgeIds[0]} has a support under a ramp`);
    }
    if (along <= previous) throw invariantFailure(`highway ${structure.edgeIds[0]} supports are not in path order`);
    if (along - previous > HIGHWAY_DECK.supportPitch + POSITION_EPS) {
      throw invariantFailure(`highway ${structure.edgeIds[0]} has an unsupported deck span`, { span: along - previous });
    }
    previous = along;
  }
  if (flatEnd - flatStart >= HIGHWAY_DECK.supportPitch && structure.supports.length === 0) {
    throw invariantFailure(`highway ${structure.edgeIds[0]} has no supports under its flat deck`);
  }
  if (structure.supports.length > 0 && flatEnd - previous > HIGHWAY_DECK.supportPitch + POSITION_EPS) {
    throw invariantFailure(`highway ${structure.edgeIds[0]} has an unsupported final deck span`, { span: flatEnd - previous });
  }
}

/** Arc distance to the closest projection of a point on a polyline. */
function distanceAlong(path: readonly Vec2[], point: Vec2): number {
  let before = 0;
  let best = { distance: Infinity, along: 0 };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const hit = closestOnSegment(point, a, b).point;
    const distance = dist(point, hit);
    const along = before + dist(a, hit);
    if (distance < best.distance || (distance === best.distance && along < best.along)) best = { distance, along };
    before += dist(a, b);
  }
  return best.along;
}
