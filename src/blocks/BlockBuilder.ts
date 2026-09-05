/**
 * Builds blocks outside the complete roadway network, with shared pedestrian
 * seams, road-facing returns and a reserved sidewalk ring.
 */
import type { Polygon, Polyline } from '../../schema/blueprint';
import type { Rng } from '../core/rng';
import type { Face } from '../streets/Faces';
import { difference, GRID_STEP, intersection, offset } from '../geom/clip';
import { filletCorners } from '../geom/fillet';
import { area } from '../geom/polygon';
import { PolygonIndex } from '../geom/PolygonIndex';
import { ALLEY_WIDTH, CURB_WIDTH } from '../streets/widths';
import { SharedBoundary } from './SharedBoundary';

/** Face land left over by the roadway: what a block is cut from. */
export interface FacePiece {
  faceIndex: number;
  pieceIndex: number;
  polygon: Polygon;
}

export interface BuiltBlock {
  /** Outer edge of the sidewalk (face minus roadway). */
  boundary: Polygon;
  /** The kerb: the outer CURB_WIDTH of the block, minus the stretches an alley takes. */
  curb: Polygon[];
  sidewalk: Polygon[];
  /** Buildable area inside the sidewalk ring. */
  interior: Polygon[];
  edgeIds: string[];
  /** Road-facing land removed to construct rounded returns. */
  returns: Polygon[];
}

const MIN_BLOCK_AREA = 250;
/** Source edges below this run are eligible for inward cleanup. */
const MIN_SOURCE_EDGE = 0.5;
const MIN_CURB_AREA = CURB_WIDTH * 0.5;

/** Curb return radius range at street corners, meters. */
const CURB_RADIUS: [number, number] = [1.5, 3];

export class BlockBuilder {
  /** Land each face keeps outside the complete carriageway network. */
  static pieces(faces: Face[], edgeBuffers: Map<string, Polygon[]>): FacePiece[] {
    const out: FacePiece[] = [];
    const buffers = new PolygonIndex([...edgeBuffers.values()].flat());
    faces.forEach((face, faceIndex) => {
      const roadway = buffers.near(face.polygon);
      // Smaller land remains open ground, without taking ownership of any roadway.
      difference([face.polygon], roadway).forEach((polygon, pieceIndex) => {
        if (area(polygon) >= MIN_BLOCK_AREA) out.push({ faceIndex, pieceIndex, polygon });
      });
    });
    return out;
  }

  static build(
    faces: Face[],
    edgeBuffers: Map<string, Polygon[]>,
    alleyPaths: Map<string, Polyline>,
    alleyPaving: Polygon[],
    fullCorridors: Polygon[],
    curbRng: Rng,
  ): BuiltBlock[] {
    const blocks: BuiltBlock[] = [];
    const pedestrian = new PolygonIndex(alleyPaving);
    const road = new PolygonIndex([...edgeBuffers.values()].flat());
    const reserved = new PolygonIndex(fullCorridors);
    for (const { faceIndex, pieceIndex, polygon } of this.pieces(faces, edgeBuffers)) {
      const face = faces[faceIndex];
      const rng = curbRng.fork(`${faceIndex}:${pieceIndex}`);
      const shared = new SharedBoundary(face.edgeIds.flatMap((id) => alleyPaths.has(id) ? [alleyPaths.get(id)!] : []));
      const piece = filletCorners(shared.clean(polygon, MIN_SOURCE_EDGE, ALLEY_WIDTH[1] / 2), (corner) =>
        shared.contains(corner) ? 0 : rng.range(CURB_RADIUS[0], CURB_RADIUS[1]),
      );
      const behindCurb = offset([piece], -CURB_WIDTH);
      const interior = difference(behindCurb, [...reserved.near(piece), ...pedestrian.near(piece)]).filter((p) => area(p) >= 60);
      if (interior.length === 0) continue;
      // The curb follows the outer boundary. The interior comes from each
      // street's full reservation, including its own left and right widths.
      const kerb = difference([piece], behindCurb);
      const returns = difference([polygon], [piece]);
      // Two independently snapped offsets share this closed frontage boundary.
      const roadFrontage = offset([...road.near(piece), ...returns], CURB_WIDTH + GRID_STEP * 2);
      const pedestrianSeam = difference(shared.band(CURB_WIDTH * 4), roadFrontage);
      // Shared pedestrian boundaries are curb-free; their roadway frontage keeps its curb.
      const cutCurb = difference(kerb, pedestrianSeam);
      const curb = cutCurb.filter((polygon) => area(polygon) >= MIN_CURB_AREA);
      const sidewalk = [
        ...difference(behindCurb, interior),
        ...intersection(kerb, pedestrianSeam),
        ...cutCurb.filter((polygon) => area(polygon) < MIN_CURB_AREA),
      ];
      blocks.push({
        boundary: piece, curb, sidewalk, interior,
        edgeIds: face.edgeIds, returns,
      });
    }
    return blocks;
  }
}
