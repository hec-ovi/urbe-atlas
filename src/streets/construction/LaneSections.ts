import type { LaneDesign, RoadProfile } from './schema/design';
import { roadwayTotal } from './Design';

/** Keeps physical lane widths while reserving the center of a divided avenue. */
export function laneSections(profile: Pick<RoadProfile, 'lanes' | 'shoulders' | 'median'>): (LaneDesign & { offset: number })[] {
  const width = roadwayTotal(profile);
  let at = width / 2 - profile.shoulders.left;
  return profile.lanes.map((lane, index) => {
    if (index === profile.lanes.length / 2) at -= profile.median?.width ?? 0;
    const offset = at - lane.width / 2;
    at -= lane.width;
    return { ...lane, offset };
  });
}
