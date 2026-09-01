/**
 * Turns street-graph faces into blocks: subtract the roadway of the face's
 * own edges, then inset for the sidewalk ring. Corner continuity is
 * structural because the ring comes from offsetting a closed polygon.
 */
import type { Polygon } from '../../schema/blueprint';
import type { Face } from '../streets/Faces';
import { difference, offset } from '../geom/clip';
import { area } from '../geom/polygon';

export interface BuiltBlock {
  faceIndex: number;
  /** Outer edge of the sidewalk (face minus roadway). */
  boundary: Polygon;
  sidewalk: Polygon[];
  /** Ring width used for this block's sidewalk, meters. */
  sidewalkWidth: number;
  /** Buildable area inside the sidewalk ring. */
  interior: Polygon[];
  edgeIds: string[];
}

const MIN_BLOCK_AREA = 250;

export class BlockBuilder {
  static build(
    faces: Face[],
    edgeBuffers: Map<string, Polygon[]>,
    sidewalkWidthOfFace: (face: Face) => number,
  ): BuiltBlock[] {
    const blocks: BuiltBlock[] = [];
    faces.forEach((face, faceIndex) => {
      const roadway: Polygon[] = [];
      for (const id of face.edgeIds) {
        const buf = edgeBuffers.get(id);
        if (buf) roadway.push(...buf);
      }
      // pieces below MIN_BLOCK_AREA stay part of the face's roadway ground
      const pieces = difference([face.polygon], roadway);
      for (const piece of pieces) {
        if (area(piece) < MIN_BLOCK_AREA) continue;
        const sw = sidewalkWidthOfFace(face);
        const interior = offset([piece], -sw).filter((p) => area(p) >= 60);
        if (interior.length === 0) continue;
        const sidewalk = difference([piece], interior);
        blocks.push({ faceIndex, boundary: piece, sidewalk, sidewalkWidth: sw, interior, edgeIds: face.edgeIds });
      }
    });
    return blocks;
  }
}
