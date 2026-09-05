import { invariantFailure } from '../../../errors';
import { compare, ringSign, type Point, type PointPool, type Ring } from '../Exact';
import { chain, nodeSegments, segments } from '../Segments';

interface Incidence { domain: number; pieces: { id: number; direction: number }[]; a: Point; b: Point }

/** A planar positive-face complex is a cover iff its oriented multiplicities agree. */
export function verifyIncidence(domain: Ring[], pieces: Ring[], pool: PointPool): void {
  const rings = [...domain, ...pieces], edges = segments(rings);
  nodeSegments(edges, pool);
  const atoms = new Map<string, Incidence>();
  let cursor = 0;
  for (let owner = 0; owner < rings.length; owner++) {
    const ring = rings[owner], perimeter: Point[] = [];
    for (let edge = 0; edge < ring.length; edge++) {
      const path = chain(edges[cursor++]);
      for (let step = 1; step < path.length; step++) {
        const a = path[step - 1], b = path[step], direction = compare(a, b) < 0 ? 1 : -1;
        const key = direction > 0 ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
        let entry = atoms.get(key);
        if (!entry) atoms.set(key, entry = { domain: 0, pieces: [], a, b });
        if (owner < domain.length) entry.domain += direction;
        else entry.pieces.push({ id: owner - domain.length, direction });
        perimeter.push(a);
      }
    }
    if (owner >= domain.length && (new Set(perimeter.map(point => point.key)).size !== perimeter.length || ringSign(perimeter) <= 0)) {
      throw invariantFailure('published piece is not a simple positive ring', { piece: owner - domain.length });
    }
  }
  for (const entry of atoms.values()) {
    const { domain: direction, pieces } = entry;
    const valid = direction ? Math.abs(direction) === 1 && pieces.length === 1 && pieces[0].direction === direction
      : pieces.length === 2 && pieces[0].id !== pieces[1].id && pieces[0].direction !== pieces[1].direction;
    if (!valid) throw invariantFailure('published ground does not cover its independent domain exactly once', {
      edge: [entry.a.value, entry.b.value], domainDirection: direction, pieces,
    });
  }
}
