import type { Polygon, Vec2 } from '../../../../schema/blueprint';

export type RectangleSide = 'south' | 'east' | 'north' | 'west';
export interface CandidateRectangle { id: string; min: Vec2; max: Vec2 }
export interface ReceivingFace { rectangleId: string; side: RectangleSide; streetId: string }
export interface CandidateFacePair { id: string; from: ReceivingFace; to: ReceivingFace }
export interface DiagonalCandidateInput {
  rectangles: CandidateRectangle[];
  facePairs: CandidateFacePair[];
  allowedRegions: Polygon[];
  /** Complete perpendicular construction envelope, in metres. */
  constructionWidth: number;
  /** Metres from each original face corner; default 3. */
  cornerClearance?: number;
  angles?: (30 | 45)[];
}
export interface CandidateMouth extends ReceivingFace {
  /** Ordered along the face from its lower X or Z coordinate. */
  points: [Vec2, Vec2];
  cornerClearances: [number, number];
}
export interface DiagonalCandidate {
  id: string;
  facePairId: string;
  angle: 30 | 45;
  slope: 1 | -1;
  constructionWidth: number;
  centerline: [Vec2, Vec2];
  footprint: Polygon;
  mouths: [CandidateMouth, CandidateMouth];
}
