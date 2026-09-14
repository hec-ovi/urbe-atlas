import type { CandidateFacePair, ReceivingFace, RectangleSide } from './diagonal-candidates/schema';
import type { GridLayoutBlock, GridLayoutPlan } from './schema';

const sides: RectangleSide[] = ['south', 'east', 'north', 'west'];
export interface CandidateSource { blocks: GridLayoutBlock[]; pair: CandidateFacePair }

/** Uses original module rectangles and their authored graph frontages. */
export class CandidateSources {
  static enumerate(plan: GridLayoutPlan): CandidateSource[] {
    const parking = new Set(plan.modules.parking?.map(bay => bay.blockId));
    const highway = new Set(plan.runs.find(run => run.id === plan.highwayRunId)?.edges.map(member => member.edgeId));
    const eligible = plan.blocks.filter(block => !parking.has(block.id) && block.edgeIds.length === 4
      && !block.edgeIds.some(id => highway.has(id)));
    const byEdge = new Map<string, { block: GridLayoutBlock; side: number }[]>();
    const result: CandidateSource[] = [];
    const face = (block: GridLayoutBlock, side: number): ReceivingFace =>
      ({ rectangleId: block.id, side: sides[side], streetId: block.edgeIds[side] });
    for (const block of eligible) {
      for (let from = 0; from < 4; from++) for (let to = from + 1; to < 4; to++) {
        result.push({ blocks: [block], pair: { id: `${block.id}:${sides[from]}:${sides[to]}`, from: face(block, from), to: face(block, to) } });
      }
      block.edgeIds.forEach((edgeId, side) => {
        const previous = byEdge.get(edgeId) ?? [];
        for (const other of previous) {
          result.push({ blocks: [other.block, block], pair: { id: `${other.block.id}:${block.id}:${edgeId}`,
            from: face(other.block, (other.side + 2) % 4), to: face(block, (side + 2) % 4),
            through: [face(other.block, other.side), face(block, side)] } });
        }
        previous.push({ block, side }); byEdge.set(edgeId, previous);
      });
    }
    return result;
  }
}
