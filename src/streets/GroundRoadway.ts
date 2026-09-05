import type { Polygon } from '../../schema/blueprint';
import type { Face } from './Faces';
import type { BuiltBlock } from '../blocks/BlockBuilder';
import { difference, intersection } from '../geom/clip';
import { PolygonIndex } from '../geom/PolygonIndex';

/** Partition the full carriageway and its rounded returns into disjoint, hole-free ground rings. */
export class GroundRoadway {
  static build(boundary: Polygon, corridors: Polygon[], faces: Face[], blocks: BuiltBlock[]): Polygon[] {
    const road = [...corridors, ...blocks.flatMap((block) => block.returns)];
    const indexed = new PolygonIndex(road);
    const rings = faces.map((face) => face.polygon);
    return [
      ...faces.flatMap((face) => intersection([face.polygon], indexed.near(face.polygon))),
      ...intersection(difference(road, rings), [boundary]),
    ];
  }
}
