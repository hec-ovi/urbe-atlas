import type { Polygon } from '../schema/blueprint';
import { SourcePartition } from './geom/partition/SourcePartition';
import { LayoutCandidates } from './streets/layout/LayoutCandidates';
import type { LayoutDiagonalCandidate } from './streets/layout/schema';

/** Retains original rectangle references and complete dry planning land. */
export class CityDiagonalCandidates {
  static retain(candidates: LayoutDiagonalCandidate[], owners: ReadonlyMap<string, string>, boundary: Polygon, water: Polygon[]) {
    const retained = LayoutCandidates.retain(candidates, owners);
    if (!water.length || !retained.length) return retained;
    const land = SourcePartition.create({ id: 'city', source: boundary });
    land.divide('city', { claims: [{ id: 'water', masks: water }], remainderId: 'dry' });
    return retained.filter(candidate => land.covers('dry', candidate.footprint));
  }
}
