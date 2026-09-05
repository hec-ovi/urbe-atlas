import type { SidewalkBands, SidewalkEdgeGeometry } from './schema/design';
import type { SidewalkGeometry } from './schema/sections';

/** Resolves the side once, from carriageway edge toward the building. */
export function resolveSidewalkGeometry(bands: SidewalkBands, edge?: SidewalkEdgeGeometry): SidewalkGeometry {
  const resolved: SidewalkEdgeGeometry = edge ? {
    curbRise: edge.curbRise,
    gutter: { width: edge.gutter.width, lip: { ...edge.gutter.lip } },
  } : { curbRise: 0.15, gutter: { width: 0, lip: { width: 0, height: 0, side: 'road' } } };
  const intervals: SidewalkGeometry['intervals'] = [];
  let at = 0;
  const append = (role: SidewalkGeometry['intervals'][number]['role'], width: number, top: number): void => {
    const start = at;
    at += width;
    intervals.push({ role, start, end: at, top });
  };
  if (edge) {
    append('gutter-lip', resolved.gutter.lip.width, resolved.gutter.lip.height);
    append('gutter', resolved.gutter.width - resolved.gutter.lip.width, 0);
  }
  append('curb', bands.curb, resolved.curbRise);
  const pavedStart = at;
  for (const role of ['border', 'furnishing', 'walking', 'frontage'] as const) append(role, bands[role], resolved.curbRise);
  return { version: '1.0.0', edge: resolved, intervals, pavedWidth: at - pavedStart, totalWidth: at };
}
