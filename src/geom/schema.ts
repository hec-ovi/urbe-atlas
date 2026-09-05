export type { Polygon, Vec2 } from '../../schema/blueprint';

/** Integer coordinates in units of the clipping grid. */
export interface GridPoint { x: number; y: number }
export type GridPath = GridPoint[];
