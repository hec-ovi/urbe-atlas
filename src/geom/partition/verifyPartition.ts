import { AtlasError, invariantFailure } from '../../errors';
import { compare, onSegment, PointPool, ringSign, type Point } from './Exact';
import { chain, nodeSegments, segmentPairs } from './Segments';
import type { PartitionVerificationInput, Polygon, SharedPartition } from './schema';

function require(condition: unknown, message: string, details?: Record<string, unknown>): asserts condition {
  if (!condition) throw invariantFailure(`partition certificate ${message}`, details);
}

/** Verifies the emitted faces and their source chains without a coordinate snap. */
export function verifyPartition(input: PartitionVerificationInput): void {
  try { verify(input.source, input.partition, input.coordinateScale); }
  catch (error) {
    if (error instanceof AtlasError) throw error;
    throw invariantFailure('partition certificate is malformed');
  }
}

function verify(sourcePolygon: Polygon, partition: SharedPartition, coordinateScale?: 1000): void {
  const pool = new PointPool(coordinateScale), proof = partition.certificate;
  require(proof.exactVertices.length === partition.vertices.length, 'vertex counts disagree');
  const points = proof.exactVertices.map(vertex => pool.restore(vertex));
  require(new Set(points.map(point => point.key)).size === points.length, 'duplicates a shared exact vertex');
  points.forEach((point, index) => require(point.value[0] === partition.vertices[index][0]
    && point.value[1] === partition.vertices[index][1], 'moves an emitted vertex'));
  const get = (id: number): Point => {
    require(Number.isInteger(id) && id >= 0 && id < points.length, 'references an unknown vertex');
    return points[id];
  };
  const source = pool.ring(sourcePolygon);
  require(proof.source.length === source.length && proof.source.every((id, index) => get(id).key === source[index].key), 'changes the source vertices');
  require(proof.pieceChains.length === partition.pieces.length, 'piece counts disagree');
  const rings = [proof.source, ...partition.pieces.map(piece => piece.vertices)];
  const chains = [proof.sourceChains, ...proof.pieceChains];
  const atomic: { a: number; b: number; piece: number }[] = [];
  for (let piece = 0; piece < rings.length; piece++) {
    const ring = rings[piece], subdivisions = chains[piece];
    require(ring.length >= 3 && new Set(ring).size === ring.length && ringSign(ring.map(get)) > 0, 'piece is not a simple positive ring');
    require(subdivisions.length === ring.length, 'edge-chain counts disagree');
    const perimeter: number[] = [];
    for (let edge = 0; edge < ring.length; edge++) {
      const a = ring[edge], b = ring[(edge + 1) % ring.length], path = subdivisions[edge];
      require(path.length >= 2 && path[0] === a && path.at(-1) === b, 'changes an edge endpoint');
      const direction = compare(get(a), get(b));
      for (let step = 0; step < path.length; step++) {
        require(onSegment(get(path[step]), get(a), get(b)), 'moves a source or piece edge');
        if (!step) continue;
        require(compare(get(path[step - 1]), get(path[step])) === direction, 'reverses or repeats an edge chain');
        perimeter.push(path[step - 1]);
        atomic.push({ a: path[step - 1], b: path[step], piece });
      }
    }
    require(new Set(perimeter).size === perimeter.length, 'boundary touches or crosses itself');
  }
  const incidences = new Map<string, { source: number; entries: { direction: number; piece: number }[] }>();
  for (const edge of atomic) {
    const key = edge.a < edge.b ? `${edge.a}:${edge.b}` : `${edge.b}:${edge.a}`, direction = edge.a < edge.b ? 1 : -1;
    let entry = incidences.get(key);
    if (!entry) incidences.set(key, entry = { source: 0, entries: [] });
    if (!edge.piece) entry.source += direction;
    else entry.entries.push({ direction, piece: edge.piece });
  }
  for (const [key, { source: direction, entries }] of incidences) {
    const details = { edge: key.split(':').map(id => get(Number(id)).value), sourceDirection: direction, entries };
    if (direction) require(Math.abs(direction) === 1 && entries.length === 1 && entries[0].direction === direction, 'does not conserve a source boundary', details);
    else require(entries.length === 2 && entries[0].direction !== entries[1].direction && entries[0].piece !== entries[1].piece, 'does not pair an interior boundary', details);
  }
  const edges = segmentPairs([...incidences.keys()].map(key => {
    const [a, b] = key.split(':').map(Number);
    return { a: get(a), b: get(b) };
  }));
  nodeSegments(edges, pool);
  require(edges.every(edge => chain(edge).length === 2), 'arrangement contains an unshared crossing or vertex');
}
