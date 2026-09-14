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

export interface DiagonalContourPlan {
  frontages: { start: Vec2; end: Vec2; inward: Vec2; pavedWidth: number }[];
  corners: { center: Vec2; radius: number; arc: Polygon }[];
}

export interface DiagonalBlockTemplate {
  definition: ModuleDefinition;
  interiors: Polygon[];
  planning: DiagonalContourPlan[];
  /** The road centreline satisfies dot(normal, point) = offset. */
  axis: { normal: Vec2; offset: number };
}
