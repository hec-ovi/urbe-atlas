import type { SectionedStreetEdge } from './schema/sections';

export type StreetSide = 'left' | 'right';

/** Centre and width of one functional sidewalk band, measured from the road edge. */
export function sidewalkBand(edge: SectionedStreetEdge, side: StreetSide, role: 'walking' | 'furnishing'): { offset: number; width: number } {
  const bands = edge.crossSection?.sidewalks[side].bands;
  if (!bands) return { offset: edge.sidewalk[side] / 2, width: edge.sidewalk[side] };
  const before = bands.curb + bands.border + (role === 'walking' ? bands.furnishing : 0);
  return { offset: before + bands[role] / 2, width: bands[role] };
}
