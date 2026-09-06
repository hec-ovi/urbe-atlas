import { BoxIndex, extent, type Box } from './BoxIndex';
import { edgeWinding, winding, type Point, type Probe, type Region } from './Exact';
import { segmentPairs, type Segment } from './Segments';

interface BoundaryEdge { id: number; a: Point; b: Point; box: Box }

/** Retains immutable boundary edges; query subdivision state is always fresh. */
export class BoundaryIndex {
  private readonly index: BoxIndex<BoundaryEdge>;
  private readonly edgeCount: number;

  constructor(private readonly rings: Region) {
    const edges: BoundaryEdge[] = [];
    for (const ring of rings) for (let position = 0; position < ring.length; position++) {
      const a = ring[position], b = ring[(position + 1) % ring.length];
      edges.push({ id: edges.length, a, b, box: extent([[a, b]]) });
    }
    this.index = new BoxIndex(edges);
    this.edgeCount = edges.length;
  }

  segments(box: Box): Segment[] {
    return segmentPairs(this.index.query(box).sort((a, b) => a.id - b.id));
  }

  /** The right ray meets only edges spanning the probe's exact height. */
  winding(probe: Probe, box: Box): number {
    if (this.edgeCount <= 8) return winding(this.rings, probe);
    const ray: Box = [box[0], box[1], Infinity, box[3]];
    let count = 0;
    for (const edge of this.index.query(ray)) count += edgeWinding(edge.a, edge.b, probe);
    return count;
  }
}
