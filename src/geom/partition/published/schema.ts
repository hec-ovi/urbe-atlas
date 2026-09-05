import type { Polygon } from '../schema';

export interface PublishedCoverPiece { id: string; polygon: Polygon }
export interface PublishedCoverInput {
  boundary: Polygon;
  exclusions: Polygon[];
  pieces: PublishedCoverPiece[];
}
