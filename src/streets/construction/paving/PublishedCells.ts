import type { GroundSurface } from '../../../../schema/blueprint';
import { invariantFailure } from '../../../errors';
import { verifyPublishedCover } from '../../../geom/partition/published/verifyPublishedCover';
import type { PublishedCoverInput } from '../../../geom/partition/published/schema';
import { cell } from './Geometry';
import { acceptsGroup, groupBaseOffset } from './Grouping';
import type { PavingFrame, PavingLayout, PavingRegion } from './schema';

export class PublishedCells {
  static validate(ground: GroundSurface, region: PavingRegion, layout: PavingLayout, frame: PavingFrame,
    version: '1.1.0' | '1.2.0'): void {
    const part = ground.construction!.part;
    if (part.kind !== 'grid') return;
    const setting = layout.bands[region.band === 'circulation' ? 'walking' : region.band];
    const module = layout.modules.find(module => module.id === part.moduleId);
    if (!module || module.id !== setting.moduleId && module.id !== setting.grouping?.moduleId
      || !Array.isArray(part.cells) || !part.cells.length) {
      throw invariantFailure('published paving grid has no compatible module or cell spans');
    }
    const expectedOffset = module.id === setting.grouping?.moduleId ? groupBaseOffset(module, setting.grouping) : [0, 0];
    const baseOffset: [number, number] = part.baseOffset === undefined ? [0, 0] : part.baseOffset;
    if (!Array.isArray(baseOffset) || baseOffset.length !== 2
      || baseOffset.some((value, axis) => !Number.isSafeInteger(value) || value !== expectedOffset[axis])
      || version === '1.1.0' && baseOffset.some(value => value !== 0)) {
      throw invariantFailure('published paving grid offset disagrees with its group or version');
    }
    if (!Array.isArray(ground.polygon) || ground.polygon.some(point => !Array.isArray(point) || point.length !== 2
      || point.some(value => !Number.isFinite(value) || Math.round(value * 1000) / 1000 !== value))) {
      throw invariantFailure('published grid owner moved a canonical corner');
    }
    const pieces: PublishedCoverInput['pieces'] = [];
    let previous: { row: number; from: number; to: number } | undefined;
    for (const span of part.cells) {
      if (!span || ![span.row, span.from, span.to].every(Number.isSafeInteger) || span.from >= span.to
        || previous && (span.row < previous.row || span.row === previous.row && span.from < previous.to)) {
        throw invariantFailure('published paving spans must be sorted, integer and disjoint');
      }
      for (let column = span.from; column < span.to; column++) {
        if (module.id === setting.grouping?.moduleId && !acceptsGroup(module, setting.grouping, column, span.row)) {
          throw invariantFailure('published paving group is outside its integer pattern');
        }
        pieces.push({ id: `cell:${pieces.length}`, polygon: cell(frame, module, column, span.row, baseOffset) });
      }
      previous = span;
    }
    verifyPublishedCover({ boundary: ground.polygon, exclusions: [], pieces });
  }
}
