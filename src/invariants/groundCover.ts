/**
 * The volumetric ground cover is a partition of the city: roadway, curb,
 * sidewalk, block and open surfaces tile it, so no two of them may overlap.
 *
 * Every coordinate sits on the geometry kernel's 1 mm grid, so two surfaces
 * that share a boundary can still report a sliver of a few square centimetres
 * where their snapped edges disagree. A defect is a band metres wide, so the
 * test asks whether the shared region survives eroding by OVERLAP_EPS.
 *
 * Pairs come from a cell index over eroded bounding boxes: surfaces that
 * only touch along a boundary drop out before any boolean runs.
 */
import type { CityBlueprint } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { intersection, offset } from '../geom/clip';
import { area } from '../geom/polygon';
import { boxOf, grow, BoxPairs } from '../geom/Boxes';
import { GROUND_LEVELS } from '../streets/surfaces';
import { CITY_GROUND_LEVELS } from '../CityGround';

/** Overlap band a surface pair may not exceed, meters. */
const OVERLAP_EPS = 0.01;

export function checkGroundCover(bp: CityBlueprint): void {
  const ground = bp.volumetric.ground;
  for (const region of ground) {
    const expected = bp.streets.construction?.modules ? CITY_GROUND_LEVELS[region.surface]
      : region.surface === 'gutter' ? undefined : GROUND_LEVELS[region.surface];
    if (!expected || region.bottom !== expected.bottom || region.top !== expected.top) {
      throw invariantFailure(`ground ${region.surface} has invalid construction levels`, {
        bottom: region.bottom,
        top: region.top,
      });
    }
  }
  const eroded = ground.map((g) => grow(boxOf(g.polygon), -OVERLAP_EPS));
  const order = ground.map((_, i) => i).sort((a, b) => eroded[a].minX - eroded[b].minX || a - b);
  const pairs = new BoxPairs(order.map((i) => eroded[i]));

  for (let ii = 0; ii < order.length; ii++) {
    const i = order[ii];
    for (const jj of pairs.after(ii)) {
      const j = order[jj];
      const shared = intersection([ground[i].polygon], [ground[j].polygon]);
      if (shared.length === 0 || offset(shared, -OVERLAP_EPS).length === 0) continue;
      throw invariantFailure(
        `ground surfaces ${i} (${ground[i].surface}) and ${j} (${ground[j].surface}) overlap`,
        { overlap: shared.reduce((s, p) => s + area(p), 0), first: ground[i], second: ground[j] },
      );
    }
  }
}
