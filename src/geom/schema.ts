import type { Polygon, Vec2 } from '../../schema/blueprint';
import type { PartitionEdgeSupportEnclosure } from './partition/schema';

export type { Polygon, Vec2 };

/** Integer coordinates in units of the clipping grid. */
export interface GridPoint { x: number; y: number }
export type GridPath = GridPoint[];

export interface NumericSweepSide { from: Vec2; to: Vec2 }
export interface NumericSweepInput {
  sides: [NumericSweepSide, NumericSweepSide];
  encoding: 'authored-1mm';
}
export interface NumericSweepEnvelope {
  polygon: Polygon;
  sides: [PartitionEdgeSupportEnclosure, PartitionEdgeSupportEnclosure];
}
