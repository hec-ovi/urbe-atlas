import type { StreetEdge } from '../../../schema/blueprint';

/** Grade traffic can occupy a carriageway without providing pedestrian sidewalks. */
export function isGradeTraffic(edge: StreetEdge): boolean {
  return edge.width > 0 && edge.elevationProfile.every(knot => knot.level === 0);
}

export function isCrossingArm(edge: StreetEdge): boolean {
  return edge.width > 0 && hasGradeSpan(edge) && edge.class !== 'highway' && edge.sidewalk.left > 0 && edge.sidewalk.right > 0;
}

export function hasGradeSpan(edge: StreetEdge): boolean {
  return edge.elevationProfile.some((knot, index, profile) => index > 0 && knot.level === 0
    && profile[index - 1].level === 0 && knot.distance > profile[index - 1].distance);
}
