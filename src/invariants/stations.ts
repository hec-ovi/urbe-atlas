/**
 * A station is walkable end to end: its platform is a real box on the track,
 * and underground every entrance has a shaft down to platform level whose
 * passage actually reaches the platform.
 */
import type { CityBlueprint, Polygon, Station, Vec2, Vec3 } from '../../schema/blueprint';
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
  if (st.box.bottom !== st.level || st.box.top <= st.box.bottom) {
    throw invariantFailure(`station ${st.id} box does not stand on its platform`, st.box);
  }
  if (st.level >= LEVELS.ground) {
    // at grade the entrance is a place on the sidewalk beside the platform: no passage to build
    if (st.shafts.length > 0) throw invariantFailure(`station ${st.id} is at grade but publishes shafts`);
    if (st.accessPaths.length > 0) throw invariantFailure(`station ${st.id} is at grade but publishes access paths`);
    return;
  }
  if (st.shafts.length !== st.entrances.length) {
    throw invariantFailure(`station ${st.id} has ${st.shafts.length} shafts for ${st.entrances.length} entrances`);
  }
  if (st.accessPaths.length !== st.entrances.length) {
    throw invariantFailure(`station ${st.id} has ${st.accessPaths.length} access paths for ${st.entrances.length} entrances`);
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
  st.accessPaths.forEach((access, i) => {
    if (access.entranceIndex !== i) {
      throw invariantFailure(`station ${st.id} access path ${i} references entrance ${access.entranceIndex}`);
    }
    const stair = access.segments[0];
    if (!stair || stair.kind !== 'stairs' || stair.path.length < 2) {
      throw invariantFailure(`station ${st.id} access path ${i} has no stair centerline`);
    }
    const start = stair.path[0];
    const foot = stair.path[stair.path.length - 1];
    if (!same3(start, atLevel(st.entrances[i], LEVELS.ground)) || !same3(foot, atLevel(st.entrances[i], st.level))) {
      throw invariantFailure(`station ${st.id} access path ${i} does not join grade to its shaft foot`);
    }
    for (let p = 0; p < stair.path.length; p++) {
      const point = stair.path[p];
      if (!point.every(Number.isFinite) || !pointInPolygon([point[0], point[2]], st.shafts[i].footprint)) {
        throw invariantFailure(`station ${st.id} stair ${i} leaves its shaft at point ${p}`);
      }
      if (p === 0) continue;
      const previous = stair.path[p - 1];
      if (Math.hypot(point[0] - previous[0], point[2] - previous[2]) <= 1e-9 || point[1] >= previous[1]) {
        throw invariantFailure(`station ${st.id} stair ${i} has a vertical or non-descending flight at point ${p}`);
      }
    }
    let end = foot;
    for (let s = 1; s < access.segments.length; s++) {
      const segment = access.segments[s];
      if (segment.kind !== 'passage' || segment.path.length < 2 || !same3(segment.path[0], end)) {
        throw invariantFailure(`station ${st.id} access path ${i} is discontinuous at segment ${s}`);
      }
      for (const point of segment.path) {
        if (!point.every(Number.isFinite) || Math.abs(point[1] - st.level) > 1e-9) {
          throw invariantFailure(`station ${st.id} access path ${i} passage leaves platform level`);
        }
      }
      end = segment.path[segment.path.length - 1];
    }
    if (!same3(end, access.platformHandoff) || Math.abs(end[1] - st.level) > 1e-9
      || !pointInPolygon([end[0], end[2]], st.platform)) {
      throw invariantFailure(`station ${st.id} access path ${i} misses its platform handoff`);
    }
  });
}

function atLevel([x, z]: Vec2, y: number): Vec3 {
  return [x, y, z];
}

function same3(a: Vec3, b: Vec3): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-9;
}
