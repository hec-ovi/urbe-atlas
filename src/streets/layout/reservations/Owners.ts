import { invariantFailure } from '../../../errors';
import type { ReservationInput, StreetOwner } from './schema';

export class Owners {
  static build(input: ReservationInput): StreetOwner[] {
    const owners = new Map<string, StreetOwner>();
    const blocks = new Map(input.blocks.map(block => [block.id, block]));
    const layouts = new Map(input.layoutBlocks.map(block => [block.id, block]));
    const underpasses = new Set(input.planning.protected.map(value => value.ownerId));
    const frontages = new Set(input.modules.frontages?.map(value => value.id));
    const medians = new Set(input.modules.frontages?.filter(value => value.kind === 'median').map(value => value.id));
    for (const [index, ground] of input.volumetric.ground.entries()) {
      if (!['roadway', 'sidewalk', 'curb', 'gutter'].includes(ground.surface)) continue;
      const id = ground.moduleBlockId ?? (ground.surface === 'roadway' ? 'roadway' : 'station-bays');
      let owner = owners.get(id);
      if (!owner) {
        const block = blocks.get(id), layout = layouts.get(id);
        if (ground.moduleBlockId && !block && !frontages.has(id)) throw invariantFailure('street ground has no source owner', { index, id });
        owner = { id, kind: medians.has(id) ? 'median' : underpasses.has(id) ? 'underpass' : block ? 'block' : frontages.has(id) ? 'perimeter'
          : ground.surface === 'roadway' ? 'roadway' : 'station', groundIndices: [], excludedParcelIds: block?.parcelIds ?? [],
          interiors: layout ? [layout.interior] : [],
          finish: input.modules.placements.find(placement => placement.blockId === id)?.finish ?? null };
        owners.set(id, owner);
      }
      owner.groundIndices.push(index);
    }
    return [...owners.values()];
  }
}
