import type { Vec2 } from '../../../schema/blueprint';
import { DiagonalCandidates } from './diagonal-candidates/DiagonalCandidates';
import { CandidateSources } from './CandidateSources';
import { sideSection } from './Sections';
import type { GridLayoutInput, GridLayoutPlan, LayoutDiagonalCandidate } from './schema';

export class LayoutCandidates {
  static plan(plan: GridLayoutPlan, input: GridLayoutInput): LayoutDiagonalCandidate[] {
    const roadProfile = input.profiles.find(profile => profile.classes.includes('street') && profile.lanes.length > 0 && profile.lanes.length <= 2);
    if (!roadProfile) return [];
    const roadWidth = roadProfile.lanes.reduce((sum, lane) => sum + lane.width, 0) + roadProfile.shoulders.left + roadProfile.shoulders.right;
    const reservationPadding = 2.5;
    const result: LayoutDiagonalCandidate[] = [];
    for (const source of CandidateSources.enumerate(plan)) {
      const rectangles = source.blocks.map(block => ({ id: block.id, min: block.outer[0], max: block.outer[2] }));
      const middle: Vec2 = [0, 1].map(axis => rectangles.reduce((sum, rectangle) =>
        sum + rectangle.min[axis] / 2 + rectangle.max[axis] / 2, 0) / rectangles.length) as Vec2;
      const section = sideSection(input.sideAt(middle, 'street').profile);
      const constructionWidth = roadWidth + 2 * section.geometry!.totalWidth;
      const reservationWidth = constructionWidth + 2 * reservationPadding;
      const proposals = DiagonalCandidates.plan({ rectangles, facePairs: [source.pair],
        allowedRegions: [...source.blocks.map(block => block.outer), ...(source.blocks.length > 1 ? plan.roadway : [])],
        constructionWidth: reservationWidth, cornerClearance: input.diagonalCornerClearance });
      for (const proposal of proposals) result.push({ ...proposal, roadProfile: structuredClone(roadProfile),
        sidewalks: { left: structuredClone(section), right: structuredClone(section) }, roadWidth,
        constructionWidth, reservationPadding, reservationWidth });
    }
    return result;
  }

  static retain(candidates: LayoutDiagonalCandidate[], ownerIdMap: ReadonlyMap<string, string>): LayoutDiagonalCandidate[] {
    return candidates.filter(candidate => [...candidate.mouths, ...candidate.intermediateMouths]
      .every(mouth => ownerIdMap.has(mouth.rectangleId))).map(candidate => ({ ...candidate,
        mouths: candidate.mouths.map(mouth => ({ ...mouth, rectangleId: ownerIdMap.get(mouth.rectangleId)! })) as LayoutDiagonalCandidate['mouths'],
        intermediateMouths: candidate.intermediateMouths.map(mouth => ({ ...mouth, rectangleId: ownerIdMap.get(mouth.rectangleId)! })),
      }));
  }
}
