import type { Vec2 } from '../../../../schema/blueprint';
import { bounds, ensureCCW } from '../../../geom/polygon';
import { SourcePartition } from '../../../geom/partition/SourcePartition';
import { Face } from './Face';
import { validateInput } from './Input';
import type { DiagonalCandidate, DiagonalCandidateInput } from './schema';

export class DiagonalCandidates {
  static plan(input: DiagonalCandidateInput): DiagonalCandidate[] {
    validateInput(input);
    if (!input.allowedRegions.length) return [];
    const { min, max } = bounds(input.allowedRegions.flat());
    const land = SourcePartition.create({ id: 'domain', source: [min, [max[0], min[1]], max, [min[0], max[1]]] });
    land.divide('domain', { claims: [{ id: 'allowed', masks: input.allowedRegions }], remainderId: 'excluded' });
    const rectangles = new Map(input.rectangles.map(rectangle => [rectangle.id, rectangle]));
    const result: DiagonalCandidate[] = [];
    const clearance = input.cornerClearance ?? 3;
    const width = input.constructionWidth;
    for (const pair of input.facePairs) {
      const from = new Face(pair.from, rectangles.get(pair.from.rectangleId)!);
      const to = new Face(pair.to, rectangles.get(pair.to.rectangleId)!);
      const through = (pair.through ?? []).map(face => new Face(face, rectangles.get(face.rectangleId)!));
      const faces = [from, ...through, to];
      for (const angle of input.angles ?? [30, 45]) for (const slope of [1, -1] as const) {
        const radians = angle * Math.PI / 180;
        const normal: Vec2 = [-slope * Math.sin(radians), Math.cos(radians)];
        const direction: Vec2 = [normal[1], -normal[0]];
        const intervals = faces.map(face => face.interval(normal, width, clearance));
        const low = Math.max(...intervals.map(value => value[0])), high = Math.min(...intervals.map(value => value[1]));
        if (low > high) continue;
        const offset = low / 2 + high / 2;
        const mouths = [from.mouth(normal, offset, width), to.mouth(normal, offset, width)] as const;
        const intermediateMouths = through.map(face => face.mouth(normal, offset, width));
        if ([...mouths, ...intermediateMouths].some(mouth => mouth.cornerClearances.some(value => !Number.isFinite(value) || value < clearance))) continue;
        const startLow = from.point(normal, offset - width / 2), startHigh = from.point(normal, offset + width / 2);
        const endLow = to.point(normal, offset - width / 2), endHigh = to.point(normal, offset + width / 2);
        const advance = (start: Vec2, end: Vec2) => (end[0] - start[0]) * direction[0] + (end[1] - start[1]) * direction[1];
        if (advance(startLow, endLow) * advance(startHigh, endHigh) <= 0) continue;
        const travelSign = Math.sign(advance(startLow, endLow));
        if (faces.slice(1).some((face, index) => [-width / 2, width / 2].some(shift =>
          advance(faces[index].point(normal, offset + shift), face.point(normal, offset + shift)) * travelSign <= 0))) continue;
        const footprint = ensureCCW([startLow, startHigh, endHigh, endLow]);
        if (!land.covers('allowed', footprint)) continue;
        result.push({ id: JSON.stringify([pair.id, angle, slope]), facePairId: pair.id, angle, slope,
          constructionWidth: width, centerline: [from.point(normal, offset), to.point(normal, offset)],
          footprint, mouths: [mouths[0], mouths[1]], intermediateMouths });
      }
    }
    return result;
  }
}
