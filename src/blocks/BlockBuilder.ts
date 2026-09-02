/**
 * Turns street-graph faces into blocks: subtract the roadway of the face's
 * own edges, round the curb corners, then inset for the curb strip and the
 * sidewalk ring. Corner continuity is structural because every ring comes
 * from offsetting the same closed polygon, so the kerb runs unbroken through
 * a junction return with both its edges parallel to it.
 */
import type { Polygon } from '../../schema/blueprint';
import type { Rng } from '../core/rng';
import type { Face } from '../streets/Faces';
import { difference, intersection, offset } from '../geom/clip';
import { filletCorners } from '../geom/fillet';
import { area } from '../geom/polygon';
import { dist } from '../geom/vec';
import { CURB_WIDTH } from '../streets/widths';

/** Face land left over by the roadway: what a block is cut from. */
export interface FacePiece {
  faceIndex: number;
  pieceIndex: number;
  polygon: Polygon;
}

export interface BuiltBlock {
  faceIndex: number;
  /** Outer edge of the sidewalk (face minus roadway). */
  boundary: Polygon;
  /** The kerb: the outer CURB_WIDTH of the block, minus the stretches an alley takes. */
  curb: Polygon[];
  sidewalk: Polygon[];
  /** Ring width used for this block's sidewalk, meters. */
  sidewalkWidth: number;
  /** Buildable area inside the sidewalk ring. */
  interior: Polygon[];
  edgeIds: string[];
}

const MIN_BLOCK_AREA = 250;
/** Boolean intersections below this run cannot carry a readable curb edge. */
const MIN_SOURCE_EDGE = 0.5;
const MIN_CURB_AREA = CURB_WIDTH * 0.5;

/** Curb return radius range at street corners, meters. */
const CURB_RADIUS: [number, number] = [1.5, 3];

export class BlockBuilder {
  /** Land each face keeps once the roadway of its own edges is subtracted. */
  static pieces(faces: Face[], edgeBuffers: Map<string, Polygon[]>): FacePiece[] {
    const out: FacePiece[] = [];
    faces.forEach((face, faceIndex) => {
      const roadway: Polygon[] = [];
      for (const id of face.edgeIds) {
        const buf = edgeBuffers.get(id);
        if (buf) roadway.push(...buf);
      }
      // pieces below MIN_BLOCK_AREA stay part of the face's roadway ground
      difference([face.polygon], roadway).forEach((polygon, pieceIndex) => {
        if (area(polygon) >= MIN_BLOCK_AREA) out.push({ faceIndex, pieceIndex, polygon });
      });
    });
    return out;
  }

  static build(
    faces: Face[],
    edgeBuffers: Map<string, Polygon[]>,
    alleyBuffers: Map<string, Polygon[]>,
    sidewalkWidthOfFace: (face: Face) => number,
    curbRng: Rng,
  ): BuiltBlock[] {
    const blocks: BuiltBlock[] = [];
    for (const { faceIndex, pieceIndex, polygon } of this.pieces(faces, edgeBuffers)) {
      const face = faces[faceIndex];
      const rng = curbRng.fork(`${faceIndex}:${pieceIndex}`);
      const piece = filletCorners(withoutShortEdges(polygon), () => rng.range(CURB_RADIUS[0], CURB_RADIUS[1]));
      const sw = sidewalkWidthOfFace(face);
      const interior = offset([piece], -sw).filter((p) => area(p) >= 60);
      if (interior.length === 0) continue;
      // three bands off the same ring, so the kerb follows every return with
      // both its edges parallel to it: kerb, then sidewalk, then the interior
      const behindCurb = offset([piece], -CURB_WIDTH);
      const kerb = difference([piece], behindCurb);
      // an alley borders no roadway: its stretch of the band is sidewalk instead
      const alleys: Polygon[] = [];
      for (const id of face.edgeIds) alleys.push(...(alleyBuffers.get(id) ?? []));
      const cutCurb = alleys.length > 0 ? difference(kerb, alleys) : kerb;
      const curb = cutCurb.filter((polygon) => area(polygon) >= MIN_CURB_AREA);
      const sidewalk = [
        ...difference(behindCurb, interior),
        ...intersection(kerb, alleys),
        ...cutCurb.filter((polygon) => area(polygon) < MIN_CURB_AREA),
      ];
      blocks.push({ faceIndex, boundary: piece, curb, sidewalk, sidewalkWidth: sw, interior, edgeIds: face.edgeIds });
    }
    return blocks;
  }
}

/** Removes millimetre-scale boolean remnants before their direction can turn a curb inward. */
function withoutShortEdges(ring: Polygon): Polygon {
  const out = ring.map((point) => [...point] as [number, number]);
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      if (dist(out[i], out[(i + 1) % out.length]) >= MIN_SOURCE_EDGE) continue;
      out.splice((i + 1) % out.length, 1);
      changed = true;
      break;
    }
  }
  return out;
}
