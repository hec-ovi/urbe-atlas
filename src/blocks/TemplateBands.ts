/**
 * One envelope band per template slot.
 *
 * A block template is cut once and instanced all over the city, so the lots at
 * one of its slots are the same lot everywhere. The first block to use the
 * template decides the floors that slot carries, from its own district, and
 * every later block builds the same band there: a block repeats with its
 * buildings, and a district's skyline comes from the templates it uses. A lot
 * outside any template keeps the band its own zoning drew.
 */
import type { Envelope } from '../../schema/blueprint';

export class TemplateBands {
  private readonly bands = new Map<string, Pick<Envelope, 'minFloors' | 'maxFloors'>>();

  /** The band this slot publishes: the first one it was given, at this parcel's own floor pitch. */
  apply(slot: string | undefined, envelope: Envelope): Envelope {
    if (!slot) return envelope;
    const band = this.bands.get(slot);
    if (!band) {
      this.bands.set(slot, { minFloors: envelope.minFloors, maxFloors: envelope.maxFloors });
      return envelope;
    }
    if (band.minFloors === envelope.minFloors && band.maxFloors === envelope.maxFloors) return envelope;
    return { ...envelope, ...band, maxHeight: Math.round(band.maxFloors * envelope.floorHeight * 100) / 100 };
  }
}
