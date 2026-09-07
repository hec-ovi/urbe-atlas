/** Geometry at grade is reserved before zoning and may not enter a building or highway column. */
import type { CityBlueprint, Polygon } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { intersection } from '../geom/clip';
import { area, bounds } from '../geom/polygon';

const AREA_EPS = 1e-6;

export function checkTransitClearance(bp: CityBlueprint): void {
  for (const line of bp.transit.subwayLines) {
    if (!(line.width > 0)) throw invariantFailure(`rail line ${line.id} has no corridor width`);
  }
  const gradeStructures = bp.transit.subwayStations.flatMap((station) => station.shafts.map((shaft) => shaft.footprint));
  for (const parcel of bp.parcels) {
    for (const station of bp.transit.subwayStations) {
      for (let i = 0; i < station.shafts.length; i++) {
        const shaftOverlap = overlapArea([station.shafts[i].footprint], parcel.footprint);
        if (shaftOverlap > AREA_EPS) {
          throw invariantFailure(`subway shaft ${station.id}:${i} enters building footprint ${parcel.id}`, {
            overlap: shaftOverlap,
          });
        }
      }
    }
  }
  for (const structure of bp.streets.highwayStructures) {
    for (const support of structure.supports) {
      const overlap = overlapArea(gradeStructures, support.footprint);
      if (overlap > AREA_EPS) {
        throw invariantFailure(`subway shaft enters highway support on ${structure.edgeIds[0]}`, { overlap });
      }
    }
  }
}

function overlapArea(subject: Polygon[], polygon: Polygon): number {
  if (subject.length === 0) return 0;
  const box = bounds(polygon);
  const nearby = subject.filter((candidate) => {
    const other = bounds(candidate);
    return other.min[0] < box.max[0] && other.max[0] > box.min[0]
      && other.min[1] < box.max[1] && other.max[1] > box.min[1];
  });
  return nearby.length === 0
    ? 0
    : intersection(nearby, [polygon]).reduce((sum, shared) => sum + area(shared), 0);
}
