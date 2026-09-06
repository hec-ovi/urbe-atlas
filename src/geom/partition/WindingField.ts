import { BoxIndex, extent, overlaps, type Box } from './BoxIndex';
import { winding, type Probe, type Region, type Ring } from './Exact';

interface Boundary { ring: Ring; box: Box }

/** Only rings enclosing the symbolic probe can contribute winding. */
export class WindingField {
  readonly box: Box;
  private readonly index?: BoxIndex<Boundary>;

  constructor(private readonly rings: Region) {
    this.box = extent(rings);
    if (rings.length > 8) this.index = new BoxIndex(rings.map(ring => ({ ring, box: extent([ring]) })));
  }

  winding(probe: Probe, box = extent([[probe.base]])): number {
    if (!overlaps(this.box, box)) return 0;
    if (!this.index) return winding(this.rings, probe);
    let count = 0;
    for (const boundary of this.index.query(box)) count += winding([boundary.ring], probe);
    return count;
  }
}
