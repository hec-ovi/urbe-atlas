import type { BuildingGrid } from '../../schema/blueprint';

/** Footprints are rectangles on the shared city construction grid. */
export interface FootprintPolicy {
  grid: BuildingGrid;
}
