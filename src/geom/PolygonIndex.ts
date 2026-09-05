import type { Polygon } from '../../schema/blueprint';
import { bounds } from './polygon';

/** Cached bounds keep local Boolean operations independent of the rest of the city. */
export class PolygonIndex {
  private readonly entries;

  constructor(polygons: Polygon[]) {
    this.entries = polygons.map((polygon) => ({ polygon, box: bounds(polygon) }));
  }

  near(region: Polygon): Polygon[] {
    if (region.length === 0) return [];
    const box = bounds(region);
    return this.entries.filter(({ box: candidate }) =>
      candidate.max[0] >= box.min[0] && candidate.min[0] <= box.max[0]
      && candidate.max[1] >= box.min[1] && candidate.min[1] <= box.max[1],
    ).map(({ polygon }) => polygon);
  }
}
