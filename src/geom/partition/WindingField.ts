import { BoxIndex, extent, overlaps, type Box } from './BoxIndex';
import { BoundaryIndex } from './BoundaryIndex';
import { winding, type Probe, type Region, type Ring } from './Exact';
import { segments, type Segment } from './Segments';

interface Boundary { ring: Ring; box: Box }

/** Only rings enclosing the symbolic probe can contribute winding. */
export class WindingField {
  readonly box: Box;
  private readonly index?: BoxIndex<Boundary>;
  private readonly boundary?: BoundaryIndex;

  constructor(readonly rings: Region, retainBoundaryIndex = false) {
    this.box = extent(rings);
    if (rings.length > 8) this.index = new BoxIndex(rings.map(ring => ({ ring, box: extent([ring]) })));
    if (retainBoundaryIndex) this.boundary = new BoundaryIndex(rings);
  }

  segments(box: Box): Segment[] {
    return this.boundary ? this.boundary.segments(box) : segments(this.rings).filter(edge => overlaps(box, edge.box));
  }

  winding(probe: Probe, box = extent([[probe.base]])): number {
    if (!overlaps(this.box, box)) return 0;
    if (!this.index) return winding(this.rings, probe);
    let count = 0;
    for (const boundary of this.index.query(box)) count += winding([boundary.ring], probe);
    return count;
  }
}
