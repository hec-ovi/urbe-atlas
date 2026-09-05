import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { invalidParams } from '../../../errors';
import { coordinateCover, GRID_STEP, precisionInterior } from '../../../geom/clip';
import { Band } from './Band';
import { CoordinateCoverage } from './CoordinateCoverage';
import { FootprintRegions } from './FootprintRegions';
import { subtractIntervals } from './Intervals';
import { StationLimits } from './StationLimits';
import type { StationInterval, StationIntervalInput } from './schema';

export class CrossingIntervals {
  static find(input: StationIntervalInput): StationInterval[] {
    validate(input);
    const band = new Band(input);
    if (input.width > band.length) return [];
    const limits = new StationLimits(band.length, input.width, input.sourceOffset ?? 0);
    const domain = limits.domain();
    if (domain.from > domain.to) return [];

    const allowed = band.candidates(input.allowed, GRID_STEP);
    if (!allowed.length) return [];
    const forbidden = band.candidates(input.forbidden ?? []);
    const excluded = band.candidates(input.excluded ?? []);
    const blocked = CoordinateCoverage.missing(band.polygon, allowed, band.candidates(coordinateCover(allowed)));
    if (excluded.length) blocked.push(...FootprintRegions.insideEnclosures(band.polygon, excluded));
    if (forbidden.length) {
      blocked.push(...precisionInterior(FootprintRegions.inside(band.polygon, forbidden))
        .map(polygon => polygon.map(point => ({ lower: point, upper: point }))));
    }

    const intervals: StationInterval[] = [];
    for (const polygon of blocked) {
      const fractions = band.fractions(polygon);
      if (!fractions) return [];
      intervals.push(limits.blocker(fractions[0], fractions[1]));
    }
    return subtractIntervals(domain, intervals);
  }
}

function validate(input: StationIntervalInput): void {
  if (!input || !point(input.a) || !point(input.b)) {
    throw invalidParams('Crossing interval segment requires finite a and b coordinates');
  }
  const length = Math.hypot(input.b[0] - input.a[0], input.b[1] - input.a[1]);
  if (!Number.isFinite(length) || length === 0) {
    throw invalidParams('Crossing interval segment must have finite positive length');
  }
  if (!Number.isFinite(input.width) || input.width / 2 <= 0) {
    throw invalidParams('Crossing interval width requires a finite positive representable half-width');
  }
  if (input.sourceOffset !== undefined && (!Number.isFinite(input.sourceOffset) || input.sourceOffset < 0
    || !Number.isFinite(input.sourceOffset + length))) {
    throw invalidParams('Crossing interval source offset must give a finite nonnegative path range');
  }
  if (!Array.isArray(input.lateral) || input.lateral.length !== 2
    || !input.lateral.every(Number.isFinite) || input.lateral[0] >= input.lateral[1]) {
    throw invalidParams('Crossing interval lateral band requires finite increasing offsets');
  }
  for (const field of ['allowed', 'forbidden', 'excluded'] as const) {
    const polygons = input[field];
    if (field !== 'allowed' && polygons === undefined) continue;
    if (!Array.isArray(polygons) || !polygons.every(ring)) {
      throw invalidParams(`Crossing interval ${field} requires finite polygon rings`);
    }
  }
}

function point(value: unknown): value is Vec2 {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

function ring(value: unknown): value is Polygon {
  if (!Array.isArray(value) || value.length < 3 || !value.every(point)) return false;
  let area = 0;
  for (let i = 0; i < value.length; i++) {
    const a = value[i], b = value[(i + 1) % value.length];
    area += a[0] * b[1] - a[1] * b[0];
  }
  return Number.isFinite(area) && area !== 0;
}
