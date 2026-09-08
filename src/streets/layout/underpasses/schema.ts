import type { Polygon } from '../../../../schema/blueprint';
import type { ModuleGroundRegion } from '../../construction/modules/schema';
export type { GridLayoutPlan } from '../schema';

export interface UnderpassSettings {
  boundary: Polygon;
  water: Polygon[];
  clearHeight: number;
}

/** Corner replacements clipped to their original building block. */
export type UnderpassBlockGround = Map<string, ModuleGroundRegion[]>;
