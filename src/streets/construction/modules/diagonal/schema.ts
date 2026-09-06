import type { Polygon, Vec2 } from '../../../../../schema/blueprint';
import type { ModuleDefinition, SidewalkWidth } from '../schema';

export interface DiagonalBlockInput {
  width: number;
  depth: number;
  /** South, east, north, west paved widths. */
  sidewalks: [SidewalkWidth, SidewalkWidth, SidewalkWidth, SidewalkWidth];
  angle: 30 | 45;
  roadWidth: number;
  diagonalSidewalk: SidewalkWidth;
  /** South-side intercept of the street centreline, in metres. */
  reach: number;
}

export interface DiagonalBlockTemplate {
  definition: ModuleDefinition;
  interiors: Polygon[];
  /** The road centreline satisfies dot(normal, point) = offset. */
  axis: { normal: Vec2; offset: number };
}
