/**
 * A station is walkable end to end: its platform is a real box on the track,
 * and underground every entrance has a shaft down to platform level whose
 * passage actually reaches the platform.
 */
import type { CityBlueprint, Polygon, Station } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { area, distanceToOutline, isSimpleRing, pointInPolygon } from '../geom/polygon';
import { intersection } from '../geom/clip';
import { LEVELS } from '../levels';
import { STATION } from '../transit/stations';

/** Meters squared: below this two boxes only touch, they do not connect. */
const CONNECTED_AREA = 0.5;

const overlaps = (a: Polygon, b: Polygon): boolean =>
  intersection([a], [b]).reduce((sum, p) => sum + area(p), 0) > CONNECTED_AREA;

export function checkStations(bp: CityBlueprint): void {
  for (const st of [...bp.transit.trainStations, ...bp.transit.subwayStations]) {
    checkStation(st);
  }
}

function checkStation(st: Station): void {
  if (!isSimpleRing(st.platform) || area(st.platform) <= 0) {
    throw invariantFailure(`station ${st.id} platform is not a simple ring`);
  }
  if (!pointInPolygon(st.position, st.platform)) {
    throw invariantFailure(`station ${st.id} platform does not cover its own position`);
  }
  if (st.level >= LEVELS.ground) {
    // at grade the entrance is a place on the sidewalk beside the platform: no passage to build
    if (st.shafts.length > 0) throw invariantFailure(`station ${st.id} is at grade but publishes shafts`);
    return;
  }
  if (st.shafts.length !== st.entrances.length) {
    throw invariantFailure(`station ${st.id} has ${st.shafts.length} shafts for ${st.entrances.length} entrances`);
  }
  for (const entrance of st.entrances) {
    const reach = pointInPolygon(entrance, st.platform) ? 0 : distanceToOutline(entrance, st.platform);
    if (reach > STATION.maxPassage) {
      throw invariantFailure(`station ${st.id} entrance is ${reach.toFixed(0)} m from its platform`, { entrance });
    }
  }
  st.shafts.forEach((shaft, i) => {
    if (shaft.top !== LEVELS.ground || shaft.bottom !== st.level) {
      throw invariantFailure(`station ${st.id} shaft ${i} does not run from grade to the platform`, {
        top: shaft.top,
        bottom: shaft.bottom,
      });
    }
    if (!isSimpleRing(shaft.footprint) || !pointInPolygon(st.entrances[i], shaft.footprint)) {
      throw invariantFailure(`station ${st.id} shaft ${i} does not stand on its entrance`);
    }
    if (shaft.passage.length === 0) {
      if (!overlaps(shaft.footprint, st.platform)) {
        throw invariantFailure(`station ${st.id} shaft ${i} has no passage and misses the platform`);
      }
      return;
    }
    if (!isSimpleRing(shaft.passage)) throw invariantFailure(`station ${st.id} shaft ${i} passage is not a simple ring`);
    if (!overlaps(shaft.passage, shaft.footprint)) {
      throw invariantFailure(`station ${st.id} shaft ${i} passage does not meet its shaft`);
    }
    if (!overlaps(shaft.passage, st.platform)) {
      throw invariantFailure(`station ${st.id} shaft ${i} passage does not reach the platform`);
    }
  });
}
