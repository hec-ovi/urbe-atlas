import type { SectionedStreetEdge } from './schema/sections';
import { resolveSidewalkGeometry } from './SidewalkGeometry';

export type StreetSide = 'left' | 'right';

/** Centre and width of one functional sidewalk band, measured from the road edge. */
export function sidewalkBand(edge: SectionedStreetEdge, side: StreetSide, role: 'walking' | 'furnishing'): { offset: number; width: number } {
  const section = edge.crossSection?.sidewalks[side];
  if (!section) return { offset: edge.sidewalk[side] / 2, width: edge.sidewalk[side] };
  const interval = (section.geometry ?? resolveSidewalkGeometry(section.bands)).intervals.find((part) => part.role === role)!;
  return { offset: interval.start + section.bands[role] / 2, width: section.bands[role] };
}
