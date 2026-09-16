import { invariantFailure } from '../../../errors';
import type { ReservationInput, StreetFrontage, StreetOwner, StreetParking } from './schema';

export class Frontages {
  static build(input: ReservationInput, owners: StreetOwner[]): StreetFrontage[] {
    const byOwner = new Map(owners.map(owner => [owner.id, owner]));
    return input.planning.frontages.map(source => {
      const owner = byOwner.get(source.ownerId);
      if (!owner) throw invariantFailure('street frontage has no ground owner', { frontageId: source.id });
      const ground = owner.groundIndices.map(index => input.volumetric.ground[index]);
      const roadTop = ground.find(value => value.surface === 'roadway' || value.surface === 'gutter')?.top;
      const pavedTop = ground.find(value => value.surface === 'sidewalk')?.top;
      if (roadTop === undefined || pavedTop === undefined) throw invariantFailure('street frontage lacks authored levels', { frontageId: source.id });
      const curbWidth = source.curbWidth === undefined ? 0.2 : source.curbWidth;
      const gutterWidth = source.gutterWidth === undefined ? 0.3 : source.gutterWidth;
      if (curbWidth !== 0.2 || (gutterWidth !== 0.3 && gutterWidth !== 0.5)) {
        throw invariantFailure('street frontage has unsupported edge dimensions', { frontageId: source.id, curbWidth, gutterWidth });
      }
      const direction = [source.inward[1], -source.inward[0]];
      const station = (point: number[]) => (point[0] - source.start[0]) * direction[0] + (point[1] - source.start[1]) * direction[1];
      return { id: source.id, ownerId: source.ownerId, edgeIds: source.edgeIds, start: source.start, end: source.end,
        inward: source.inward, stationRange: [0, station(source.end)], moduleStationOffset: station(source.moduleStationOrigin),
        pavedWidth: source.pavedWidth, roadTop, pavedTop, curbWidth, gutterWidth, cornerIds: source.cornerIds };
    });
  }

  static parking(input: ReservationInput, frontages: StreetFrontage[]): StreetParking[] {
    const byId = new Map(frontages.map(frontage => [frontage.id, frontage]));
    return (input.modules.parking ?? []).map((source, index) => {
      if (source.profile !== 'native') throw invariantFailure('street reservations require native parking dimensions', { parkingIndex: index });
      const frontage = byId.get(source.frontageId);
      if (!frontage) throw invariantFailure('parking has no authored frontage', { parkingIndex: index });
      const shift = frontage.moduleStationOffset;
      return { id: `parking:${source.frontageId}:${source.start}`, ownerId: source.blockId, frontageId: source.frontageId,
        start: source.start + shift, end: source.end + shift,
        support: { start: source.support.start + shift, end: source.support.end + shift },
        slotCount: source.slotCount, slotLength: source.slotLength, depth: source.width, endRun: source.endRun,
        walkingClearance: source.walkingClearance, footprint: source.footprint, slots: source.slots };
    });
  }
}
