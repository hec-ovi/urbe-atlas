/** A seeded minority of large factory lots carry several industrial storeys. */
import type { BuildingParcelType, Envelope, Vec2 } from '../../schema/blueprint';
import type { PlannedDistrict } from '../districts/DistrictPlanner';
import { Rng } from '../core/rng';

/** Rectangle rotations can lose a few floating-point bits at an exact size boundary. */
const SIZE_EPSILON = 1e-7;

interface FactoryLot {
  type: BuildingParcelType;
  lot: readonly Vec2[];
  footprint: readonly Vec2[];
  district: Pick<PlannedDistrict, 'kind' | 'maxFloors'>;
  floorCap: number;
  slot?: string;
  /** The factory's own low band, before a repeated template lends it another use's band. */
  original: Envelope;
}

/**
 * Applied after template bands so industrial towers neither inherit a low
 * neighbour's band nor raise unrelated buildings sharing their template slot.
 * Independent streams leave zoning types, tiers and all other random draws intact.
 */
export function factoryEnvelope(envelope: Envelope, lot: FactoryLot, seed: string): Envelope {
  if (lot.type !== 'factory') return envelope;

  const cap = Math.min(lot.district.maxFloors, lot.floorCap);
  const low = capped(lot.original, cap);
  if (lot.district.kind !== 'industrial' || cap < 3
    || minimumSide(lot.lot) + SIZE_EPSILON < 24 || minimumSide(lot.footprint) + SIZE_EPSILON < 18) return low;

  const key = lot.slot === undefined ? geometryKey(lot.lot) : `slot:${lot.slot}`;
  const rng = Rng.from(seed, 'factory-towers').fork(key);
  if (!rng.chance(1 / 3)) return low;

  const maxFloors = rng.int(3, Math.min(6, cap));
  return { ...lot.original, minFloors: 3, maxFloors,
    maxHeight: Math.round(maxFloors * lot.original.floorHeight * 100) / 100 };
}

/** The hosted inputs are rectangles; edge lengths keep rotated thin lots ineligible. */
function minimumSide(polygon: readonly Vec2[]): number {
  if (polygon.length !== 4) return 0;
  return Math.min(...polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return Math.hypot(next[0] - point[0], next[1] - point[1]);
  }));
}

/** Lot identity is independent of the rectangle's starting corner or winding. */
function geometryKey(polygon: readonly Vec2[]): string {
  const corners = [...polygon].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return `lot:${JSON.stringify(corners)}`;
}

function capped(envelope: Envelope, cap: number): Envelope {
  if (envelope.maxFloors <= cap) return envelope;
  return { ...envelope, minFloors: Math.min(envelope.minFloors, cap), maxFloors: cap,
    maxHeight: Math.round(cap * envelope.floorHeight * 100) / 100 };
}
