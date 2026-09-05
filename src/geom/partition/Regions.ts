import { invariantFailure } from '../../errors';
import { extent, overlaps } from './BoxIndex';
import { leftProbe, ringSign, winding, type PointPool, type Region } from './Exact';
import { triangulate } from './Triangulation';
import { coalesce } from './Coalescing';

const simpleCache = new WeakMap<Region, Region>();

export function connected(region: Region, pool: PointPool): Region[] {
  const outers = region.filter(ring => ringSign(ring) > 0).map(ring => ({ rings: [ring], box: extent([ring]) }));
  for (const hole of region.filter(ring => ringSign(ring) < 0)) {
    const probe = leftProbe(hole[0], hole[1], pool), box = extent([[probe.base]]);
    const candidates = outers.filter(outer => overlaps(outer.box, box) && winding([outer.rings[0]], probe) !== 0);
    if (candidates.length !== 1) throw invariantFailure('partition hole has no unique exterior');
    candidates[0].rings.push(hole);
  }
  return outers.map(outer => outer.rings);
}

/** Candidate triangulation uses existing vertices; the final certificate proves its cover. */
export function simple(region: Region, pool: PointPool): Region {
  const cached = simpleCache.get(region);
  if (cached) return cached;
  const result: Region = [];
  for (const component of connected(region, pool)) {
    if (component.length === 1) { result.push(component[0]); continue; }
    result.push(...coalesce(triangulate(component, pool), pool));
  }
  simpleCache.set(region, result);
  return result;
}
