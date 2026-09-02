/**
 * Runs the three streamline passes (highway, road, street), coarse to fine.
 * Finer tiers seed from coarser lines so the hierarchy connects by construction.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import type { Rng } from '../core/rng';
import type { ResolvedParams } from '../params/defaults';
import type { PlannedDistrict } from '../districts/DistrictPlanner';
import { FieldBasis, TensorField } from '../field/TensorField';
import { bounds, pointInPolygon } from '../geom/polygon';
import { StreamlineTracer, TracedLine } from './StreamlineTracer';

/** Irregularity from which a downtown turns radial instead of staying on the city grid. */
const RADIAL_DOWNTOWN_FROM = 0.4;

export class StreetGrowth {
  static buildField(
    boundary: Polygon,
    params: ResolvedParams,
    districts: PlannedDistrict[],
    cityTheta: number,
  ): TensorField {
    // Every gridded district sits on the one city grid. Only a downtown turns
    // radial, and only when the city is asked to be irregular; a regular city
    // keeps its downtown on the grid too.
    const radialDowntown = params.irregularity >= RADIAL_DOWNTOWN_FROM;
    const bases: FieldBasis[] = districts.map((d) => {
      if (d.kind === 'downtown' && radialDowntown) {
        return { kind: 'radial', center: d.center, weight: 2, sigma: d.radius * 1.2 };
      }
      return {
        kind: 'grid',
        center: d.center,
        theta: cityTheta,
        weight: d.kind === 'industrial' || d.kind === 'downtown' ? 1.4 : 1,
        sigma: d.radius * 1.2,
      };
    });
    const size = Math.min(params.size.width, params.size.depth);
    return new TensorField({
      bases,
      boundary,
      // the boundary bends streets along the edge only as far as the city is irregular
      boundaryWeight: 1.2 * params.irregularity,
      boundarySigma: size * 0.07,
    });
  }

  static grow(
    field: TensorField,
    boundary: Polygon,
    rng: Rng,
    params: ResolvedParams,
    districts: PlannedDistrict[],
  ): TracedLine[] {
    const tracer = new StreamlineTracer(field, boundary);
    const size = Math.min(params.size.width, params.size.depth);
    const { min, max } = bounds(boundary);

    if (params.features.highways) {
      const hwSep = Math.min(Math.max(size / 4, 400), 1500);
      const hwSeeds: { point: Vec2; family: 'major' | 'minor' }[] = [];
      const cx = (min[0] + max[0]) / 2;
      const cz = (min[1] + max[1]) / 2;
      hwSeeds.push({ point: [cx, cz], family: 'major' });
      hwSeeds.push({ point: [cx, cz], family: 'minor' });
      for (const d of districts) {
        hwSeeds.push({ point: d.center, family: 'major' });
      }
      tracer.traceTier(
        'highway',
        { dsep: hwSep, dtest: hwSep / 3, dstep: 20, minLength: size * 0.45, maxSteps: 800 },
        hwSeeds,
        rng.fork('highway'),
      );
    }

    const roadSeeds = [
      ...districts.flatMap((d) => [
        { point: d.center, family: 'major' as const },
        { point: d.center, family: 'minor' as const },
      ]),
      ...tracer.seedsFromLines(260, 260),
    ];
    tracer.traceTier(
      'road',
      { dsep: 260, dtest: 85, dstep: 12, minLength: 280, maxSteps: 600 },
      roadSeeds,
      rng.fork('road'),
    );

    const dartRng = rng.fork('street.darts');
    const darts: { point: Vec2; family: 'major' | 'minor' }[] = [];
    for (let i = 0; i < 400; i++) {
      const p: Vec2 = [dartRng.range(min[0], max[0]), dartRng.range(min[1], max[1])];
      if (pointInPolygon(p, boundary)) {
        darts.push({ point: p, family: i % 2 === 0 ? 'major' : 'minor' });
      }
    }
    tracer.traceTier(
      'street',
      { dsep: 90, dtest: 30, dstep: 10, minLength: 130, maxSteps: 500 },
      [...tracer.seedsFromLines(90, 90), ...darts],
      rng.fork('street'),
    );

    return tracer.lines;
  }
}
