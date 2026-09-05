import type { BuildingGrid } from '../../schema/blueprint';
import type { FootprintShape } from '../../schema/params';

export interface FootprintPolicy {
  shape: FootprintShape;
  grid: BuildingGrid;
}
