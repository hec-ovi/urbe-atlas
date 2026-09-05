import type { Polygon } from '../../schema/blueprint';
import type { GroundSourceClaim, SourceGroundCoverInput } from '../../schema/ground';
import { invariantFailure } from '../errors';
import { SourcePartition } from '../geom/partition/SourcePartition';
import type { SourceGroundCoverPlan } from './GroundCoverSchema';
import { GroundSources } from './GroundSources';

/** Admits complete claims into the same retained partition used for final publication. */
export class GroundClaims {
  static plan(input: SourceGroundCoverInput): SourceGroundCoverPlan {
    if (input.format !== 'source-claims-v1') throw invariantFailure('ground claim format is unsupported');
    if (!Array.isArray(input.claims) || !Array.isArray(input.excluded)
      || input.claims.some(claim => !claim || !Array.isArray(claim.masks))) {
      throw invariantFailure('ground source claim lists are invalid');
    }
    const sources = GroundSources.table([...input.claims.map(claim => claim.source), input.remainder]);
    if (input.remainder.kind !== 'land' || input.remainder.surface !== 'open') {
      throw invariantFailure('ground remainder must name open land', { sourceId: input.remainder.id });
    }
    const partition = SourcePartition.create({ id: 'ground:city', source: input.boundary, coordinateScale: 1000 });
    const excludedId = 'ground:excluded';
    let available = 'ground:available:0';
    partition.divide('ground:city', {
      claims: [{ id: excludedId, masks: input.excluded }], remainderId: available,
    });
    for (const claim of input.claims) for (const mask of claim.masks) {
      if (!partition.covers(available, mask)) throw invariantFailure('ground source claim leaves available land', {
        sourceId: claim.source.id, mask,
      });
    }
    const owners: SourceGroundCoverPlan['owners'] = [];
    for (const [index, claim] of input.claims.entries()) {
      for (const mask of claim.masks) if (!partition.covers(available, mask)) {
        throw invariantFailure('ground source claims overlap', {
          sourceId: claim.source.id,
          conflictingSourceIds: this.conflicts(mask, input.claims.slice(0, index)), mask,
        });
      }
      const source = sources[index];
      const ownerId = `ground:source:${source.id}`;
      const next = `ground:available:${index + 1}`;
      partition.divide(available, { claims: [{ id: ownerId, masks: claim.masks }], remainderId: next });
      owners.push({ ownerId, sourceId: source.id, surface: source.surface, bottom: source.bottom, top: source.top });
      available = next;
    }
    const remainder = sources[sources.length - 1];
    const remainderId = `ground:source:${remainder.id}`;
    partition.divide(available, { claims: [], remainderId });
    owners.push({ ownerId: remainderId, sourceId: remainder.id,
      surface: remainder.surface, bottom: remainder.bottom, top: remainder.top });
    return { format: input.format, partition, boundary: input.boundary, coordinateScale: 1000,
      sources, owners, excludedOwnerIds: [excludedId] };
  }

  /** Failure evidence only; original authored masks enter this nonpublishing query. */
  private static conflicts(mask: Polygon, previous: GroundSourceClaim[]): string[] {
    const query = SourcePartition.create({ id: 'subject', source: mask, coordinateScale: 1000 });
    query.divide('subject', {
      claims: previous.map((claim, index) => ({ id: `prior:${index}`, masks: claim.masks })), remainderId: 'outside',
    });
    return previous.filter((_, index) => query.boundaries(`prior:${index}`).length > 0).map(claim => claim.source.id);
  }
}
