import type { Polygon } from '../../../../../schema/blueprint';
import type { ModuleDefinition, SidewalkWidth } from '../schema';

export interface UnderpassInput {
  startWidth: SidewalkWidth;
  endWidth: SidewalkWidth;
  startReturn: SidewalkWidth;
  endReturn: SidewalkWidth;
  /** Elevated highway carriageway width, in positive whole metres. */
  span: number;
}

export interface UnderpassTemplate {
  definition: ModuleDefinition;
  boundary: Polygon;
}
