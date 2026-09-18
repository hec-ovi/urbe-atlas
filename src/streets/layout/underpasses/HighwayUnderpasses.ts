import type { StreetEdge, Vec2 } from '../../../../schema/blueprint';
import type { ModuleDefinition, ModuleGroundRegion, ModulePlacement, QuarterTurn } from '../../construction/modules/schema';
import { ModuleGround } from '../../construction/modules/ModuleGround';
import { UnderpassModule } from '../../construction/modules/underpass';
import { GradeDatum } from '../../construction/datum';
import { highwayEnvelopes } from '../../construction/highway';
import { difference, intersection, snap, union } from '../../../geom/clip';
import { PolygonIndex } from '../../../geom/PolygonIndex';
import { invariantFailure, unsatisfiable } from '../../../errors';
import { UnderpassPlanning } from './UnderpassPlanning';
import { cornerDimensions, placementKey, turnPoint, waterExcludedKeys } from './Placement';
import type { GridLayoutPlan, UnderpassBlockGround, UnderpassSettings } from './schema';

/** Fits one physical owner per grade sidewalk beneath the highway. */
export class HighwayUnderpasses {
  static apply(plan: GridLayoutPlan, settings: UnderpassSettings): UnderpassBlockGround {
    const additions: UnderpassBlockGround = new Map();
    if (!plan.edges.some(edge => edge.class === 'highway')) return additions;
    const format = plan.modules.format ?? 'source', curbWidth = 0.2, gutterWidth = format === 'district' ? 0.5 : 0.3;
    const rim = snap(curbWidth + gutterWidth);
    const excluded = waterExcludedKeys(settings.waterExcludedCorners === undefined ? [] : settings.waterExcludedCorners, plan.planning);
    if (excluded.size && !settings.water.length) throw invariantFailure('water-excluded corners require water exclusions');
    const edges = new Map(plan.edges.map(edge => [edge.id, edge]));
    const sourceCorners = new Map(plan.planning.corners.filter(corner => corner.kind === 'explicit')
      .map(corner => [placementKey(corner.placement.origin, corner.placement.turn), corner]));
    const corners = new Map(plan.modules.placements.filter(placement => {
      const source = sourceCorners.get(placementKey(placement.origin, placement.turn));
      return source?.ownerId === placement.blockId && source.placement.moduleId === placement.moduleId;
    })
      .map(placement => [placementKey(placement.origin, placement.turn), placement]));
    const blocks = new Map(plan.blocks.map(block => [block.id, block]));
    const obstacles = GradeDatum.clearanceFootprints({
      plan: GradeDatum.physicalPlan({ boundary: settings.boundary, edges: plan.edges, structures: highwayEnvelopes(plan.edges) }),
      supports: [], groundTop: 0.2, clearHeight: settings.clearHeight,
    }).flatMap(owner => owner.polygons);
    const obstructed = new PolygonIndex([...settings.water, ...obstacles]);
    const removed = new Set<ModulePlacement>();
    const definitions = new Map<string, ModuleDefinition>();
    const modules = new Map<string, ReturnType<typeof UnderpassModule.build>>();
    const templates = new Map<string, ModuleGroundRegion[]>();
    const placements: ModulePlacement[] = [];
    const frontages: NonNullable<GridLayoutPlan['modules']['frontages']> = [];

    for (const node of plan.nodes) {
      const incident = node.edgeIds.map(id => edges.get(id)!);
      const highway = incident.filter(edge => edge.class === 'highway');
      if (highway.length !== 2) continue;
      const grade = incident.filter(edge => edge.class !== 'highway');
      if (grade.length !== 2 || grade.some(edge => !edge.elevationProfile?.every(knot => knot.level === 0))
        || grade[0].width !== grade[1].width || highway[0].width !== highway[1].width) {
        throw invariantFailure('highway underpass requires two matching grade arms', { nodeId: node.id });
      }
      const directions = grade.map(edge => this.direction(edge, node.id));
      if (directions.some(direction => Math.abs(direction[0]) + Math.abs(direction[1]) !== 1)
        || directions[0].some((value, axis) => value !== -directions[1][axis])) {
        throw invariantFailure('highway underpass requires opposite grid arms', { nodeId: node.id });
      }
      const forward: QuarterTurn = directions[0][0] !== 0 ? 0 : 1;
      for (const turn of [forward, (forward + 2) % 4] as QuarterTurn[]) {
        const half = highway[0].width / 2 + rim;
        const offset = grade[0].width / 2 + rim;
        const startPoint = turnPoint([-half, offset], node.position, turn);
        const endPoint = turnPoint([half, offset], node.position, turn);
        const firstKey = placementKey(startPoint, ((turn + 1) % 4) as QuarterTurn), lastKey = placementKey(endPoint, turn);
        const first = corners.get(firstKey), last = corners.get(lastKey);
        const consumed = [first, last].some(placement => placement && removed.has(placement));
        if (!first || !last || consumed) {
          const absent = [first ? undefined : firstKey, last ? undefined : lastKey].filter((key): key is string => key !== undefined);
          if (!consumed && absent.length && absent.every(key => excluded.has(key))) continue;
          throw invariantFailure('highway underpass has no paired corner owners', { nodeId: node.id, turn, missingPlacementKeys: absent });
        }
        const [startWidth, startReturn] = cornerDimensions(first, plan.planning, format);
        const [endReturn, endWidth] = cornerDimensions(last, plan.planning, format);
        const key = [format, startWidth, endWidth, startReturn, endReturn, highway[0].width].join(':');
        let module = modules.get(key);
        if (!module) {
          module = UnderpassModule.build({ format, startWidth, endWidth, startReturn, endReturn, span: highway[0].width });
          modules.set(key, module);
        }
        const origin = turnPoint([-startReturn, 0], first.origin, turn);
        const boundary = module.boundary.map(point => turnPoint(point, origin, turn));
        if (difference([boundary], [settings.boundary]).length || intersection([boundary], obstructed.near(boundary)).length) {
          throw unsatisfiable('highway underpass cannot fit city land and pedestrian clearance', { nodeId: node.id, turn });
        }
        const id = `underpass:${node.id}:${turn}`;
        const placement: ModulePlacement = { moduleId: module.definition.id, blockId: id, origin, turn,
          count: 1, step: 2, finish: first.finish };
        UnderpassPlanning.replace(plan, { ownerId: id, nodeId: node.id, first, last, origin, turn,
          gradeEdgeIds: grade.map(edge => edge.id), highwayEdgeIds: highway.map(edge => edge.id),
          length: snap(startReturn + highway[0].width + rim * 2 + endReturn), width: Math.min(startWidth, endWidth),
          startReturn, endReturn, curbWidth, gutterWidth });
        definitions.set(module.definition.id, module.definition);
        placements.push(placement);
        frontages.push({ id, boundary });
        removed.add(first); removed.add(last);
        let local = templates.get(module.definition.id);
        if (!local) {
          local = ModuleGround.cover({ version: '1.0.0', definitions: [module.definition],
            placements: [{ ...placement, origin: [0, 0], turn: 0 }] });
          templates.set(module.definition.id, local);
        }
        const regions = local.map(region => ({ ...region, blockId: id,
          polygon: region.polygon.map(point => turnPoint(point, origin, turn)) }));
        for (const old of [first, last]) {
          const block = blocks.get(old.blockId);
          if (!block) throw invariantFailure('highway corner has no building block', { blockId: old.blockId });
          const clipped = regions.flatMap(region => intersection([region.polygon], [block.outer])
            .map(polygon => ({ ...region, polygon, blockId: old.blockId })));
          additions.set(old.blockId, [...(additions.get(old.blockId) ?? []), ...clipped]);
        }
      }
    }

    const owners = new PolygonIndex(frontages.map(frontage => frontage.boundary));
    plan.roadway = plan.roadway.flatMap(polygon => {
      const cuts = owners.near(polygon);
      return cuts.length ? difference([polygon], cuts) : [polygon];
    });
    plan.modules.placements = [...plan.modules.placements.filter(placement => !removed.has(placement)), ...placements];
    const used = new Set(plan.modules.placements.map(placement => placement.moduleId));
    plan.modules.definitions = [...plan.modules.definitions, ...definitions.values()].filter(definition => used.has(definition.id));
    plan.modules.frontages = [...(plan.modules.frontages ?? []), ...frontages];
    for (const [blockId, regions] of additions) {
      additions.set(blockId, (['roadway', 'sidewalk', 'curb', 'gutter'] as const).flatMap(surface => {
        const rows = regions.filter(region => region.surface === surface);
        return rows.length ? union(rows.map(region => region.polygon)).map(polygon => ({ ...rows[0], polygon })) : [];
      }));
    }
    return additions;
  }

  private static direction(edge: StreetEdge, nodeId: string): Vec2 {
    const from = edge.from === nodeId ? edge.path[0] : edge.path.at(-1)!;
    const to = edge.from === nodeId ? edge.path[1] : edge.path.at(-2)!;
    return [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1])];
  }
}
