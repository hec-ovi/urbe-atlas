/**
 * Turns street-graph faces into blocks: subtract the roadway of the face's
 * own edges, round the curb corners, then inset for the sidewalk ring. Corner
 * continuity is structural because the ring comes from offsetting a closed
 * polygon.
 */
import type { Polygon } from '../../schema/blueprint';
import type { Rng } from '../core/rng';
import type { Face } from '../streets/Faces';
import { difference, offset } from '../geom/clip';
import { filletCorners } from '../geom/fillet';
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

/** Curb return radius range at street corners, meters. */
const CURB_RADIUS: [number, number] = [1.5, 3];

export class BlockBuilder {
  static build(
    faces: Face[],
    edgeBuffers: Map<string, Polygon[]>,
    sidewalkWidthOfFace: (face: Face) => number,
    curbRng: Rng,
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
      pieces.forEach((raw, pieceIndex) => {
        if (area(raw) < MIN_BLOCK_AREA) return;
        const rng = curbRng.fork(`${faceIndex}:${pieceIndex}`);
        const piece = filletCorners(raw, () => rng.range(CURB_RADIUS[0], CURB_RADIUS[1]));
        const sw = sidewalkWidthOfFace(face);
        const interior = offset([piece], -sw).filter((p) => area(p) >= 60);
        if (interior.length === 0) return;
        const sidewalk = difference([piece], interior);
        blocks.push({ faceIndex, boundary: piece, sidewalk, sidewalkWidth: sw, interior, edgeIds: face.edgeIds });
      });
    });
    return blocks;
  }
}
