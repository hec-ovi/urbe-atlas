import { AtlasError, invariantFailure } from '../../../errors';
import { overlay } from '../Arrangement';
import { PointPool } from '../Exact';
import { readRing } from '../RingInput';
import type { Polygon } from '../schema';
import { conversionWitnesses } from './Conversion';
import { verifyIncidence } from './Incidence';
import type { PublishedCoverInput } from './schema';

function polygon(value: Polygon, pool: PointPool) {
  if (!Array.isArray(value) || value.some(point => !Array.isArray(point) || point.length !== 2
    || point.some(coordinate => typeof coordinate !== 'number' || !Number.isFinite(coordinate)))) {
    throw invariantFailure('published polygons require finite coordinate pairs');
  }
  return readRing(value, pool);
}

/** Checks public geometry without generation-time ownership or proof data. */
export function verifyPublishedCover(input: PublishedCoverInput): void {
  try {
    const pool = new PointPool(), boundary = polygon(input.boundary, pool);
    const exclusions = input.exclusions.map(value => polygon(value, pool));
    const ids = new Set<string>();
    const pieces = input.pieces.map(piece => {
      if (typeof piece.id !== 'string' || !piece.id.length || ids.has(piece.id)) throw invariantFailure('published piece IDs must be unique nonempty strings');
      ids.add(piece.id);
      try { return polygon(piece.polygon, pool); }
      catch (error) {
        throw invariantFailure('published piece is malformed', { piece: piece.id, cause: error instanceof Error ? error.message : String(error) });
      }
    });
    const domain = exclusions.length ? overlay([boundary], [exclusions], pool)[1] : [boundary];
    try { verifyIncidence(domain, pieces, pool); return; }
    catch (error) { if (!(error instanceof AtlasError)) throw error; }
    verifyIncidence(domain, conversionWitnesses([boundary, ...exclusions], pieces, pool), pool);
  } catch (error) {
    if (error instanceof AtlasError) throw error;
    throw invariantFailure('published ground cover is malformed');
  }
}
