import type { Polygon, Vec2 } from '../../../schema/blueprint';

export interface PartitionInput { id: string; source: Polygon; coordinateScale?: 1000 }
export interface PartitionVerificationInput { source: Polygon; partition: SharedPartition; coordinateScale?: 1000 }
export interface PartitionClaim { id: string; masks: Polygon[] }
export interface Division { claims: PartitionClaim[]; remainderId: string }
export interface PartitionPiece { ownerId: string; vertices: number[]; fixed: boolean }
export interface PartitionComponent { id: string; boundaries: Polygon[] }

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
