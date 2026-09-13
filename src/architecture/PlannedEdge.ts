/** A street edge together with its movement data, as the architecture steps read it. */
import type { DrivingLane, Reservation, WalkingLane } from '../../schema/architecture';
import type { StreetEdge } from '../../schema/blueprint';

export type PlannedEdge = StreetEdge & {
  reservation: Reservation;
  lanes: DrivingLane[];
  walkingLanes: WalkingLane[];
};
