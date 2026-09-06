import { BoxIndex, extent, overlaps, type Box } from './BoxIndex';
import { BoundaryIndex } from './BoundaryIndex';
import { winding, type Probe, type Region, type Ring } from './Exact';
import { segments, type Segment } from './Segments';

interface Boundary { id: number; ring: Ring; box: Box; index?: BoundaryIndex }

/** Only rings enclosing the symbolic probe can contribute winding. */
export class WindingField {
  readonly box: Box;
  private readonly index?: BoxIndex<Boundary>;
  private readonly boundaries?: Boundary[];

  constructor(readonly rings: Region, private readonly prepared = false) {
    this.box = extent(rings);
    if (rings.length > 8 || prepared) {
      this.boundaries = rings.map((ring, id) => ({ id, ring, box: extent([ring]), index: prepared ? new BoundaryIndex([ring]) : undefined }));
      if (rings.length > 8) this.index = new BoxIndex(this.boundaries);
    }
  }

  segments(box: Box): Segment[] {
    if (!this.prepared) return segments(this.rings).filter(edge => overlaps(box, edge.box));
    return this.candidates(box).sort((a, b) => a.id - b.id).flatMap(boundary => boundary.index!.segments(box));
  }

  winding(probe: Probe, box = extent([[probe.base]])): number {
    if (!overlaps(this.box, box)) return 0;
    if (!this.boundaries) return winding(this.rings, probe);
    let count = 0;
    for (const boundary of this.candidates(box)) count += boundary.index ? boundary.index.winding(probe, box) : winding([boundary.ring], probe);
    return count;
  }

  private candidates(box: Box): Boundary[] {
    return this.index ? this.index.query(box) : this.boundaries!.filter(boundary => overlaps(boundary.box, box));
  }
}
