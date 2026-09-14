import { invalidParams } from '../../../errors';
import { SourcePartition } from '../../../geom/partition/SourcePartition';
import type { DiagonalCandidateInput } from './schema';

const point = (value: unknown): value is [number, number] => Array.isArray(value)
  && value.length === 2 && value.every(Number.isFinite);
const identity = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export function validateInput(input: DiagonalCandidateInput): void {
  if (!input || !Array.isArray(input.rectangles) || !Array.isArray(input.facePairs)
    || !Array.isArray(input.allowedRegions)) throw invalidParams('candidate collections must be arrays');
  if (!Number.isFinite(input.constructionWidth) || input.constructionWidth <= 0
    || !Number.isFinite(input.cornerClearance ?? 3) || (input.cornerClearance ?? 3) < 0)
    throw invalidParams('candidate width must be positive and cornerClearance nonnegative');
  const angles = input.angles ?? [30, 45];
  if (!Array.isArray(angles) || !angles.length || angles.some(angle => angle !== 30 && angle !== 45)
    || new Set(angles).size !== angles.length) throw invalidParams('angles must contain distinct 30 or 45 values');
  const rectangles = new Set<string>();
  for (const rectangle of input.rectangles) {
    if (!rectangle || !identity(rectangle.id) || rectangles.has(rectangle.id)
      || !point(rectangle.min) || !point(rectangle.max)
      || rectangle.min.some((value, axis) => value >= rectangle.max[axis]
        || !Number.isFinite(rectangle.max[axis] - value))) throw invalidParams('invalid candidate rectangle');
    rectangles.add(rectangle.id);
  }
  const pairs = new Set<string>();
  for (const pair of input.facePairs) {
    if (!pair || !identity(pair.id) || pairs.has(pair.id)) throw invalidParams('invalid face-pair identity');
    pairs.add(pair.id);
    for (const face of [pair.from, pair.to]) {
      if (!face || !rectangles.has(face.rectangleId) || !identity(face.streetId)
        || !['south', 'east', 'north', 'west'].includes(face.side)) throw invalidParams('invalid receiving face');
    }
  }
  for (const region of input.allowedRegions) {
    if (!Array.isArray(region) || region.length < 3 || !region.every(point)) throw invalidParams('invalid allowed region');
    try { SourcePartition.create({ id: 'validation', source: region }); }
    catch { throw invalidParams('allowed regions must be finite simple unclosed rings'); }
  }
}
