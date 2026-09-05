import type { ElevationPoint } from '../../../../schema/blueprint';
import { LEVELS } from '../../../levels';
import type { HighwayEnvelope } from './schema';

/** Height knots for one highway run, including its terminal ramps. */
export function highwayElevationProfile(
  total: number,
  level: number,
  ramps: HighwayEnvelope['ramps'],
): ElevationPoint[] {
  const points: ElevationPoint[] = [{ distance: 0, level: ramps.start > 0 ? LEVELS.ground : level }];
  if (ramps.start > 0) points.push({ distance: ramps.start, level });
  if (ramps.end > 0) points.push({ distance: total - ramps.end, level });
  points.push({ distance: total, level: ramps.end > 0 ? LEVELS.ground : level });
  return points
    .sort((a, b) => a.distance - b.distance)
    .filter((point, i, sorted) => i === 0 || Math.abs(point.distance - sorted[i - 1].distance) > 1e-9);
}

export function levelAt(profile: readonly ElevationPoint[], distance: number): number {
  if (distance <= profile[0].distance) return profile[0].level;
  for (let i = 1; i < profile.length; i++) {
    const next = profile[i];
    if (distance > next.distance) continue;
    const previous = profile[i - 1];
    const span = next.distance - previous.distance;
    const t = span <= 1e-9 ? 0 : (distance - previous.distance) / span;
    return previous.level + (next.level - previous.level) * t;
  }
  return profile[profile.length - 1].level;
}
