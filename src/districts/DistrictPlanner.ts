/**
 * Plans district centers, kinds and wealth tiers before street growth,
 * so the tensor field can shape each district's morphology.
 * Wealth geography: downtown rich, industry peripheral and poor,
 * tiers elsewhere biased richer toward the center.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import type { DistrictKind, WealthTier } from '../../schema/params';
import type { Rng } from '../core/rng';
import type { ResolvedParams } from '../params/defaults';
import { area, bounds, centroid, pointInPolygon } from '../geom/polygon';
import { dist } from '../geom/vec';
import { unsatisfiable } from '../errors';

export interface PlannedDistrict {
  index: number;
  center: Vec2;
  kind: DistrictKind;
  tier: WealthTier;
  maxFloors: number;
  /** Approximate radius for field basis decay. */
  radius: number;
}

const TIERS: WealthTier[] = ['poor', 'mid', 'rich', 'high_rich'];

export class DistrictPlanner {
  static plan(rng: Rng, boundary: Polygon, params: ResolvedParams): PlannedDistrict[] {
    const [minCount, maxCount] = params.districtCount;
    const count = rng.int(minCount, maxCount);
    const cityArea = area(boundary);
    const radius = Math.sqrt(cityArea / count / Math.PI);
    const minSep = radius * 1.1;
    const { min, max } = bounds(boundary);

    const centers: Vec2[] = [];
    let tries = 0;
    while (centers.length < count && tries < 4000) {
      tries++;
      const p: Vec2 = [rng.range(min[0], max[0]), rng.range(min[1], max[1])];
      if (!pointInPolygon(p, boundary)) continue;
      if (centers.some((c) => dist(c, p) < minSep)) continue;
      centers.push(p);
    }
    if (centers.length < minCount) {
      throw unsatisfiable(`could not place ${minCount} district centers; enlarge size or lower districtCount`, {
        placed: centers.length,
      });
    }

    const cityCenter = centroid(boundary);
    const byCentrality = centers
      .map((center, i) => ({ center, i, d: dist(center, cityCenter) }))
      .sort((a, b) => a.d - b.d || a.i - b.i);

    const kinds = new Array<DistrictKind>(centers.length);
    kinds[byCentrality[0].i] = 'downtown';
    const industrialCount = centers.length >= 6 ? 2 : centers.length >= 3 ? 1 : 0;
    for (let k = 0; k < industrialCount; k++) {
      kinds[byCentrality[byCentrality.length - 1 - k].i] = 'industrial';
    }
    if (centers.length >= 2 && kinds[byCentrality[1].i] === undefined) {
      kinds[byCentrality[1].i] = 'commercial';
    }
    for (let i = 0; i < centers.length; i++) {
      if (kinds[i] === undefined) kinds[i] = rng.chance(0.6) ? 'residential' : 'mixed';
    }

    const maxD = Math.max(...byCentrality.map((c) => c.d), 1);
    const industrialCenters = centers.filter((_, i) => kinds[i] === 'industrial');

    return centers.map((center, i) => {
      const kind = kinds[i];
      let tier: WealthTier;
      if (kind === 'downtown') tier = rng.chance(0.4) ? 'high_rich' : 'rich';
      else if (kind === 'industrial') tier = 'poor';
      else {
        const centrality = 1 - dist(center, cityCenter) / maxD; // 1 = central
        const nearIndustry = industrialCenters.some((c) => dist(c, center) < radius * 2);
        const w = { ...params.tierWeights };
        w.rich *= 0.6 + centrality;
        w.high_rich *= 0.3 + centrality;
        w.poor *= nearIndustry ? 2 : 1.2 - centrality;
        tier = TIERS[rng.weighted(TIERS.map((t) => w[t]))];
      }
      return {
        index: i,
        center,
        kind,
        tier,
        maxFloors: params.maxFloorsByDistrict[kind] ?? params.maxFloors,
        radius,
      };
    });
  }
}
