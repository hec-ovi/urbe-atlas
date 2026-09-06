import { BoxIndex, extent, overlaps, type Box } from './BoxIndex';
import { edgeWinding, type Point, type Probe, type Ring } from './Exact';
import { segmentPairs, type Segment } from './Segments';

interface BoundaryEdge { id: number; a: Point; b: Point; box: Box }

/** Retains immutable boundary edges; query subdivision state is always fresh. */
export class BoundaryIndex {
  private readonly edges: BoundaryEdge[];
  private readonly index?: BoxIndex<BoundaryEdge>;

  constructor(ring: Ring) {
    this.edges = ring.map((a, id) => {
      const b = ring[(id + 1) % ring.length];
      return { id, a, b, box: extent([[a, b]]) };
    });
    if (this.edges.length > 8) this.index = new BoxIndex(this.edges);
  }

  segments(box: Box): Segment[] {
    const edges = this.index ? this.index.query(box) : this.edges.filter(edge => overlaps(box, edge.box));
    return segmentPairs(edges.sort((a, b) => a.id - b.id));
  }

  /** The right ray meets only edges spanning the probe's exact height. */
  winding(probe: Probe, box: Box): number {
    const ray: Box = [box[0], box[1], Infinity, box[3]];
    let count = 0;
    for (const edge of this.index ? this.index.query(ray) : this.edges) count += edgeWinding(edge.a, edge.b, probe);
    return count;
  }
}
