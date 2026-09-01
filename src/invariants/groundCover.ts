/**
 * The volumetric ground cover is a partition of the city: roadway, sidewalk,
 * block and open surfaces tile it, so no two of them may overlap.
 *
 * Every coordinate sits on the geometry kernel's 1 mm grid, so two surfaces
 * that share a boundary can still report a sliver of a few square centimetres
 * where their snapped edges disagree. A defect is a band metres wide, so the
 * test asks whether the shared region survives eroding by OVERLAP_EPS.
 *
 * Pairs are found by an x sweep over eroded bounding boxes: surfaces that
 * only touch along a boundary drop out before any boolean runs.
 */
import type { CityBlueprint } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { intersection, offset } from '../geom/clip';
import { area, bounds } from '../geom/polygon';

/** Overlap band a surface pair may not exceed, meters. */
const OVERLAP_EPS = 0.01;

interface Box {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export function checkGroundCover(bp: CityBlueprint): void {
  const ground = bp.volumetric.ground;
  const boxes: Box[] = ground.map((g) => {
    const b = bounds(g.polygon);
    return {
      minX: b.min[0] + OVERLAP_EPS,
      minZ: b.min[1] + OVERLAP_EPS,
      maxX: b.max[0] - OVERLAP_EPS,
      maxZ: b.max[1] - OVERLAP_EPS,
    };
  });
  const order = ground.map((_, i) => i).sort((a, b) => boxes[a].minX - boxes[b].minX || a - b);

  for (let ii = 0; ii < order.length; ii++) {
    const i = order[ii];
    for (let jj = ii + 1; jj < order.length; jj++) {
      const j = order[jj];
      if (boxes[j].minX > boxes[i].maxX) break;
      if (boxes[j].minZ > boxes[i].maxZ || boxes[i].minZ > boxes[j].maxZ) continue;
      const shared = intersection([ground[i].polygon], [ground[j].polygon]);
      if (shared.length === 0 || offset(shared, -OVERLAP_EPS).length === 0) continue;
      throw invariantFailure(
        `ground surfaces ${i} (${ground[i].surface}) and ${j} (${ground[j].surface}) overlap`,
        { overlap: shared.reduce((s, p) => s + area(p), 0) },
      );
    }
  }
}
