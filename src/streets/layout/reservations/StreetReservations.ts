import { AtlasError, invariantFailure } from '../../../errors';
import { Owners } from './Owners';
import { Frontages } from './Frontages';
import { validateReservations } from './validate';
import type { ProtectedStreetReference, ReservationCity, ReservationInput, StreetReservations as Snapshot } from './schema';

/** Publishes source supports over the saved ground array without rebuilding any ground. */
export class StreetReservations {
  static build(input: ReservationInput): Snapshot {
    try { return this.construct(input); } catch (error) { return this.failure(error); }
  }

  private static construct(input: ReservationInput): Snapshot {
    const owners = Owners.build(input), frontages = Frontages.build(input, owners);
    const protectedReferences: ProtectedStreetReference[] = input.streets.highwayStructures.map((_, structureIndex) => ({ kind: 'highway', structureIndex }));
    for (const source of input.planning.protected) {
      protectedReferences.push({ kind: 'underpass', ownerId: source.ownerId, nodeId: source.nodeId, edgeIds: source.edgeIds,
        highwayIndices: input.streets.highwayStructures.flatMap((structure, index) => structure.edgeIds.some(id => source.edgeIds.includes(id)) ? [index] : []) });
    }
    for (const station of input.transit.subwayStations) {
      station.entranceBays?.forEach((_, bayIndex) => protectedReferences.push({ kind: 'station-bay', stationId: station.id, bayIndex }));
      station.shafts.forEach((_, shaftIndex) => protectedReferences.push({ kind: 'station-shaft', stationId: station.id, shaftIndex }));
    }
    const result: Snapshot = { version: '1.0.0', groundArray: { path: 'volumetric.ground', count: input.volumetric.ground.length },
      owners, frontages, corners: input.planning.corners, parking: Frontages.parking(input, frontages), protected: protectedReferences };
    this.validate(result, input);
    return structuredClone(result);
  }

  static validate(reservations: Snapshot, city: ReservationCity): void {
    try { validateReservations(reservations, city); } catch (error) { this.failure(error); }
  }

  private static failure(error: unknown): never {
    if (error instanceof AtlasError) throw error;
    throw invariantFailure('invalid street reservation data', { cause: error instanceof Error ? error.message : String(error) });
  }
}
