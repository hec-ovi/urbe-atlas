import type { Polygon, Vec2 } from '../../../schema/blueprint';

export interface PartitionInput { id: string; source: Polygon; coordinateScale?: 1000 }
export interface PartitionVerificationInput { source: Polygon; partition: SharedPartition; coordinateScale?: 1000 }
export type PartitionEncoding = 'authored-1mm' | 'binary';
export interface PartitionCoordinates { encoding?: PartitionEncoding }
export interface PartitionEdgePosition { from: Vec2; to: Vec2; t: number }
export interface PartitionEdgePositionInput extends PartitionCoordinates { position: PartitionEdgePosition }
export type PartitionEdgeMask = PartitionEdgePosition[];
export interface PartitionEdgeMaskInput extends PartitionCoordinates { mask: PartitionEdgeMask }
export interface PartitionClaim extends PartitionCoordinates { id: string; masks: Polygon[]; edgeMasks?: PartitionEdgeMask[] }
export interface PartitionReservation extends PartitionCoordinates { id: string; polygon: Polygon }
export interface Division { claims: PartitionClaim[]; remainderId: string }
export interface PartitionPiece { ownerId: string; vertices: number[]; fixed: boolean }
export interface PartitionComponent { id: string; boundaries: Polygon[] }
export interface PartitionPointEnclosure { lower: Vec2; upper: Vec2 }

/** Homogeneous rational coordinate (x / w, y / w); not published in ground JSON. */
export interface ExactVertex { x: string; y: string; w: string }

export interface PartitionCertificate {
  exactVertices: ExactVertex[];
  source: number[];
  /** One complete ordered chain per original source edge, including its endpoints. */
  sourceChains: number[][];
  /** One complete ordered chain per edge of each published piece. */
  pieceChains: number[][][];
}

export interface SharedPartition {
  vertices: Vec2[];
  pieces: PartitionPiece[];
  certificate: PartitionCertificate;
}

export type { Polygon, Vec2 };
