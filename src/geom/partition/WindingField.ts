import { BoxIndex, extent, overlaps, type Box } from './BoxIndex';
import { BoundaryIndex } from './BoundaryIndex';
import type { Probe, Region } from './Exact';
import type { Segment } from './Segments';

interface Boundary { id: number; box: Box; index: BoundaryIndex }

/** Only rings enclosing the symbolic probe can contribute winding. */
export class WindingField {
  readonly box: Box;
  private readonly index?: BoxIndex<Boundary>;
  private readonly boundaries: Boundary[];

  constructor(readonly rings: Region) {
    this.box = extent(rings);
    this.boundaries = rings.map((ring, id) => ({ id, box: extent([ring]), index: new BoundaryIndex(ring) }));
    if (rings.length > 8) this.index = new BoxIndex(this.boundaries);
  }

  segments(box: Box): Segment[] {
    return this.candidates(box).sort((a, b) => a.id - b.id).flatMap(boundary => boundary.index.segments(box));
  }

  winding(probe: Probe, box: Box): number {
    if (!overlaps(this.box, box)) return 0;
    let count = 0;
    for (const boundary of this.candidates(box)) count += boundary.index.winding(probe, box);
    return count;
  }

  private candidates(box: Box): Boundary[] {
    return this.index ? this.index.query(box) : this.boundaries.filter(boundary => overlaps(boundary.box, box));
  }
}
