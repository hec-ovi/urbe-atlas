import type { Polygon, Vec2 } from '../../../schema/blueprint';
import { invariantFailure } from '../../errors';
import { difference, hasInteriorBeyondPrecision as hasInterior, intersection } from '../../geom/clip';
import { area, distanceToOutline, isSimpleRing, pointInPolygon } from '../../geom/polygon';
import { PolygonIndex } from '../../geom/PolygonIndex';
import { distanceTo, length as pathLength, offsetAt } from '../../geom/polyline';
import { dist } from '../../geom/vec';
import { LEVELS } from '../../levels';
import { StreetCorridors } from '../../streets/construction/StreetCorridors';
import { sidewalkBand } from '../../streets/construction/SidewalkSection';
import { STATION } from '../stations';
import type { StationEntranceState } from './schema';

/** Checks the published entrance ownership and its exact street-side handoff. */
export function validateStationEntrances(bp: StationEntranceState): void {
  const edges = new Map(bp.streets.edges.map((edge) => [edge.id, edge]));
  const corridors = new StreetCorridors(bp.streets.edges);
  const lots = new PolygonIndex(bp.parcels.map((parcel) => parcel.lot));
  const paving = new PolygonIndex(bp.volumetric.ground.filter((ground) => ground.surface === 'sidewalk').map((ground) => ground.polygon));
  const reserved: Polygon[] = [];
  const modern = bp.streets.edges.some((edge) => edge.crossSection !== undefined);
  for (const station of [...bp.transit.trainStations, ...bp.transit.subwayStations]) {
    const bays = station.entranceBays;
    if (!bays) {
      if (modern && station.level < LEVELS.ground) throw invariantFailure(`station ${station.id} has no entrance bay reservations`);
      for (const entrance of station.entrances) {
        const onSidewalk = bp.streets.edges.some((edge) => distanceTo(edge.path, entrance) <= edge.width / 2 + Math.max(edge.sidewalk.left, edge.sidewalk.right) + 0.001
          && (['left', 'right'] as const).some((side) => StreetCorridors.band(edge, side, 'walking').some((polygon) => covers(polygon, entrance))));
        if (!onSidewalk) throw invariantFailure(`station ${station.id} entrance is not on a sidewalk band`, { entrance });
      }
      continue;
    }
    if (bays.length !== station.entrances.length || bays.length !== station.shafts.length) {
      throw invariantFailure(`station ${station.id} entrance bay count differs from its access count`);
    }
    for (const [index, bay] of bays.entries()) {
      const fail = (reason: string): never => { throw invariantFailure(`station ${station.id} bay ${index} ${reason}`); };
      const edge = edges.get(bay.edgeId);
      if (!edge || (bay.side !== 'left' && bay.side !== 'right')) fail('has no declared street side');
      if (!isSimpleRing(bay.footprint) || !isSimpleRing(bay.shaft) || bay.approach.length < 2) fail('has incomplete construction geometry');
      const walking = StreetCorridors.band(edge!, bay.side, 'walking');
      if (!walking.some((polygon) => covers(polygon, bay.approach[0]))) fail('does not meet its walking band');
      const band = sidewalkBand(edge!, bay.side, 'walking');
      if (!Number.isFinite(bay.distance) || bay.distance < 0 || bay.distance > pathLength(edge!.path)) fail('has an invalid edge distance');
      const expectedConnection = offsetAt(edge!.path, bay.distance, (edge!.width / 2 + band.offset) * (bay.side === 'left' ? 1 : -1));
      if (dist(expectedConnection, bay.approach[0]) > 0.002) fail('walking handoff disagrees with its edge distance');
      if (dist(bay.approach[bay.approach.length - 1], station.entrances[index]) > 1e-9) fail('does not reach its entrance');
      if (bay.approach.some((point) => !point.every(Number.isFinite) || !covers(bay.footprint, point))) fail('approach leaves its reserved land');
      if (bay.shaft.length !== 4) fail('shaft is not rectangular');
      const sides = bay.shaft.map((point, i) => dist(point, bay.shaft[(i + 1) % bay.shaft.length])).sort((a, b) => a - b);
      if (sides.some((size, i) => Math.abs(size - (i < 2 ? STATION.shaft.width : STATION.shaft.length)) > 0.002)) fail('shaft dimensions differ from the station design');
      if (hasInterior(difference([bay.shaft], [bay.footprint]))) fail('does not contain its shaft');
      if (hasInterior(difference([bay.footprint], [bp.meta.boundary]))) fail('leaves city land');
      if (hasInterior(difference([bay.shaft], [station.shafts[index].footprint]))
        || hasInterior(difference([station.shafts[index].footprint], [bay.shaft]))) fail('shaft disagrees with the reserved footprint');
      if (overlaps(bay.shaft, corridors.index.near(bay.shaft))) fail('shaft occupies the street corridor');
      for (const lot of lots.near(bay.footprint)) {
        const shared = intersection([bay.footprint], [lot]);
        const overlapArea = size(shared);
        if (hasInterior(shared)) throw invariantFailure(`station ${station.id} bay ${index} reserved land overlaps a parcel`, {
          bayFootprint: bay.footprint, parcelLot: lot, intersection: shared, overlapArea,
        });
      }
      if (overlaps(bay.footprint, reserved)) fail('reserved land overlaps another entrance bay');
      if (hasInterior(difference([bay.footprint], paving.near(bay.footprint)))) fail('reserved land lacks sidewalk paving');
      reserved.push(bay.footprint);
    }
  }
}

const size = (polygons: Polygon[]): number => polygons.reduce((sum, polygon) => sum + area(polygon), 0);
const overlaps = (polygon: Polygon, others: Polygon[]): boolean => hasInterior(intersection([polygon], others));
const covers = (polygon: Polygon, point: Vec2): boolean => pointInPolygon(point, polygon) || distanceToOutline(point, polygon) <= 0.001;
