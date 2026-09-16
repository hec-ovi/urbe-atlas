import type { Polygon } from '../../../../schema/blueprint';
import type { ModuleCornerPlan, ModuleGroundRegion } from '../../construction/modules/schema';
export type { GridLayoutPlan } from '../schema';

export interface UnderpassSettings {
  boundary: Polygon;
  water: Polygon[];
  /** Original corner supports removed with whole water-intersecting blocks. */
  waterExcludedCorners?: ModuleCornerPlan[];
  clearHeight: number;
}

/** Corner replacements clipped to their original building block. */
export type UnderpassBlockGround = Map<string, ModuleGroundRegion[]>;
