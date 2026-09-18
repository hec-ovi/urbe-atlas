import type { DistrictKind } from '../../../schema/params';
import type { StreetClass } from '../../../schema/blueprint';
import type { QuarterTurn } from '../construction/modules/schema';
import { NATIVE_PARKING, NativeParking } from '../construction/modules/NativeParking';

/** One bay reserved on a block frontage: where it starts and how many cars it holds. */
export interface ParkingBay { start: number; slots: number }

/**
 * Kerbside parking is a rule, not a lottery. Every street keeps one kerb for
 * parked cars: a block reserves its south and west frontages, so a street is
 * parked on one side and clear on the other. Stations are whole 2 m units, the
 * grid street construction closes a run on, so a bay never splits a piece.
 */
export class ParkingBays {
  /** The two block sides that carry the parked kerb of their street. */
  static readonly KERBS: readonly QuarterTurn[] = [0, 3];
  /** Slots one bay holds by zone: a dense kerb carries crossings, stops and loading, so it parks less. */
  private static readonly SLOTS: Record<DistrictKind, number> = {
    residential: 6, mixed: 6, industrial: 5, commercial: 4, downtown: 3,
  };
  /** Plain sidewalk the module kit keeps before the first station and after the last. */
  private static readonly HEAD = 8;
  private static readonly TAIL = 6;

  /** A divided avenue keeps both kerb lanes moving, and a highway frontage has no kerb at all. */
  static allows(side: QuarterTurn, streetClass: StreetClass, divided: boolean): boolean {
    return this.KERBS.includes(side) && (streetClass === 'street' || streetClass === 'road' && !divided);
  }

  /** The bay a frontage of this clear length carries, centred on the 2 m station grid. */
  static bay(length: number, zone: DistrictKind): ParkingBay | undefined {
    const apron = NATIVE_PARKING.apron, slot = NATIVE_PARKING.slotLength;
    const room = length - this.HEAD - this.TAIL - apron - NATIVE_PARKING.endRun * 2;
    const slots = Math.min(this.SLOTS[zone], Math.floor(room / slot));
    if (slots < 1) return undefined;
    const bay = NativeParking.length(slots);
    const last = 2 * Math.floor((length - this.TAIL - apron - bay) / 2);
    return { start: Math.min(last, Math.max(this.HEAD, 2 * Math.floor((length - bay) / 4))), slots };
  }
}
