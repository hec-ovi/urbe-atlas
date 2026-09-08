import type { StreetEdge, StreetNode, Vec2 } from '../../../schema/blueprint';
import { Rng } from '../../core/rng';
import { AtlasError } from '../../errors';
import { DiagonalBlock } from '../construction/modules/diagonal/DiagonalBlock';
import type { DiagonalBlockTemplate } from '../construction/modules/diagonal/schema';
import type { SidewalkWidth } from '../construction/modules/schema';
import type { GridLayoutInput, GridLayoutPlan } from './schema';
import { crossSection, sideSection } from './Sections';

/** Adds bounded local exceptions by splitting only their two known frontage edges. */
export class DiagonalCuts {
  static apply(plan: GridLayoutPlan, input: GridLayoutInput): void {
    const random = Rng.from(input.seed, 'diagonal-cuts');
    const profiles = input.profiles.filter(profile => profile.lanes.length <= 2
      && Number.isSafeInteger(profile.lanes.reduce((sum, lane) => sum + lane.width, 0) + profile.shoulders.left + profile.shoulders.right));
    if (!profiles.length) return;
    const firstAngle = random.chance(0.5) ? 30 : 45;
    const byId = new Map(plan.edges.map(edge => [edge.id, edge]));
    const parking = new Set(plan.modules.parking?.map(bay => bay.blockId));
    const highway = new Set(plan.runs.find(run => run.id === plan.highwayRunId)?.edges.map(member => member.edgeId));
    const candidates = plan.blocks.map(block => ({ block, frontages: block.edgeIds.map(id => byId.get(id)!), rank: random.next() }))
      .filter(({ block, frontages }) => !parking.has(block.id) && frontages.length === 4
        && !frontages.some(edge => highway.has(edge.id))
        && frontages[0].class === 'street' && frontages[3].class === 'street'
        && block.outer[0][0] > plan.bounds.min[0] + 15 && block.outer[0][1] > plan.bounds.min[1] + 15
        && block.outer[2][0] < plan.bounds.max[0] - 15 && block.outer[2][1] < plan.bounds.max[1] - 15)
      .sort((a, b) => a.rank - b.rank);
    const used = new Set<string>();
    const templates = new Map<string, DiagonalBlockTemplate>();
    const target = Math.max(1, Math.floor(plan.blocks.length / 20));
    let placed = 0;
    for (const { block, frontages } of candidates) {
      if (placed >= target) break;
      if (frontages.some(edge => used.has(edge.id))) continue;
      const angle = (placed % 2 === 0 ? firstAngle : firstAngle === 30 ? 45 : 30) as 30 | 45;
      const origin = block.outer[0], width = block.outer[2][0] - origin[0], depth = block.outer[2][1] - origin[1];
      const tangent = Math.tan(angle * Math.PI / 180);
      const [southWidth, eastWidth, northWidth, westWidth] = frontages.map(edge => edge.width / 2);
      const low = Math.max(40 - westWidth - southWidth / tangent, (40 - southWidth) / tangent - westWidth);
      const high = Math.min(width + eastWidth - 40 - southWidth / tangent, (depth + northWidth - 40) / tangent - westWidth);
      if (high < low) continue;
      const reach = Math.ceil((low + high) / 4) * 2;
      if (reach > high) continue;
      const profile = profiles[placed % profiles.length];
      const roadWidth = profile.lanes.reduce((sum, lane) => sum + lane.width, 0) + profile.shoulders.left + profile.shoulders.right;
      const middle: Vec2 = [origin[0] + reach / 2, origin[1] + reach * tangent / 2];
      const selected = input.sideAt(middle, 'street');
      const section = sideSection(selected.profile);
      const sidewalks = frontages.map((edge, side) => edge.crossSection!.sidewalks[side < 2 ? 'left' : 'right'].geometry!.pavedWidth) as [SidewalkWidth, SidewalkWidth, SidewalkWidth, SidewalkWidth];
      const moduleInput = { width, depth, sidewalks, angle, roadWidth, diagonalSidewalk: section.geometry!.pavedWidth as SidewalkWidth, reach };
      const key = JSON.stringify(moduleInput);
      let template = templates.get(key);
      try { if (!template) { template = DiagonalBlock.build(moduleInput); templates.set(key, template); } }
      catch (error) { if (error instanceof AtlasError && error.code === 'E_UNSATISFIABLE') continue; throw error; }
      const { normal, offset } = template.axis;
      const south = frontages[0], west = frontages[3];
      const start: Vec2 = [west.path[0][0], origin[1] + (offset - normal[0] * (west.path[0][0] - origin[0])) / normal[1]];
      const end: Vec2 = [origin[0] + (offset - normal[1] * (south.path[0][1] - origin[1])) / normal[0], south.path[0][1]];
      const interior = template.interiors.map(polygon => polygon.map(([x, z]): Vec2 => [origin[0] + x, origin[1] + z]));
      const from = this.attach(plan, west, start), to = this.attach(plan, south, end);
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      const id = `e${plan.edges.length}`, runId = `sr${plan.runs.length}`;
      const edge: StreetEdge = { id, from: from.id, to: to.id, path: [start, end], class: 'street', width: roadWidth,
        sidewalk: { left: section.geometry!.totalWidth, right: section.geometry!.totalWidth }, districtIds: [], level: 0,
        elevationProfile: [{ distance: 0, level: 0 }, { distance: length, level: 0 }], crossSection: crossSection(runId, profile, section, section) };
      plan.edges.push(edge); from.edgeIds.push(id); to.edgeIds.push(id);
      plan.runs.push({ id: runId, profileId: profile.id, path: [start, end], length,
        edges: [{ edgeId: id, start: 0, end: length, forward: true }] });
      block.edgeIds.push(id); block.interiors = interior; block.interior = interior[0];
      plan.modules.placements = plan.modules.placements.filter(placement => placement.blockId !== block.id);
      if (!plan.modules.definitions.some(definition => definition.id === template.definition.id)) plan.modules.definitions.push(template.definition);
      plan.modules.placements.push({ moduleId: template.definition.id, blockId: block.id, origin, turn: 0, count: 1, step: 2, finish: selected.finish });
      frontages.forEach(edge => used.add(edge.id));
      placed++;
    }
    plan.nodes.forEach(node => { node.connections = [{ level: 0, edgeIds: [...node.edgeIds] }]; });
  }

  private static attach(plan: GridLayoutPlan, edge: StreetEdge, point: Vec2): StreetNode {
    const to = edge.to, end = edge.path[1];
    const firstLength = Math.hypot(point[0] - edge.path[0][0], point[1] - edge.path[0][1]);
    const secondLength = Math.hypot(end[0] - point[0], end[1] - point[1]);
    const nextId = `e${plan.edges.length}`;
    const node: StreetNode = { id: `n${plan.nodes.length}`, position: point, edgeIds: [edge.id, nextId], connections: [] };
    plan.nodes.push(node);
    plan.edges.push({ ...edge, id: nextId, from: node.id, path: [point, end],
      elevationProfile: [{ distance: 0, level: 0 }, { distance: secondLength, level: 0 }] });
    edge.to = node.id; edge.path = [edge.path[0], point];
    edge.elevationProfile = [{ distance: 0, level: 0 }, { distance: firstLength, level: 0 }];
    const previousEnd = plan.nodes.find(candidate => candidate.id === to)!;
    previousEnd.edgeIds = previousEnd.edgeIds.map(id => id === edge.id ? nextId : id);
    const run = plan.runs.find(run => run.id === edge.crossSection!.runId)!;
    run.edges = run.edges.flatMap(member => member.edgeId !== edge.id ? [member] : [
      { ...member, end: member.start + firstLength }, { ...member, edgeId: nextId, start: member.start + firstLength },
    ]);
    plan.blocks.forEach(block => { block.edgeIds = block.edgeIds.flatMap(id => id === edge.id ? [edge.id, nextId] : [id]); });
    return node;
  }
}
