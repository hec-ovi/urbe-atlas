import { BoxIndex, extent, type Box } from './BoxIndex';
import type { Point, Region } from './Exact';
import { segmentPairs, type Segment } from './Segments';

interface BoundaryEdge { id: number; a: Point; b: Point; box: Box }

/** Retains immutable boundary edges; query subdivision state is always fresh. */
export class BoundaryIndex {
  private readonly index: BoxIndex<BoundaryEdge>;

  constructor(rings: Region) {
    const edges: BoundaryEdge[] = [];
    for (const ring of rings) for (let position = 0; position < ring.length; position++) {
      const a = ring[position], b = ring[(position + 1) % ring.length];
      edges.push({ id: edges.length, a, b, box: extent([[a, b]]) });
    }
    this.index = new BoxIndex(edges);
  }

  segments(box: Box): Segment[] {
    return segmentPairs(this.index.query(box).sort((a, b) => a.id - b.id));
  }
}
