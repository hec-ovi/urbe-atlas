import type { StreetEdge, Vec2 } from '../../../../schema/blueprint';
import type { ModuleDefinition, ModuleGroundRegion, ModulePlacement, QuarterTurn } from '../../construction/modules/schema';
import { ModuleGround } from '../../construction/modules/ModuleGround';
import { UnderpassModule } from '../../construction/modules/underpass';
import { GradeDatum } from '../../construction/datum';
import { highwayEnvelopes } from '../../construction/highway';
import { difference, intersection, union } from '../../../geom/clip';
import { PolygonIndex } from '../../../geom/PolygonIndex';
import { invariantFailure, unsatisfiable } from '../../../errors';
import { cornerDimensions, placementKey, turnPoint } from './Placement';
import type { GridLayoutPlan, UnderpassBlockGround, UnderpassSettings } from './schema';

/** Fits one physical owner per grade sidewalk beneath the highway. */
export class HighwayUnderpasses {
  static apply(plan: GridLayoutPlan, settings: UnderpassSettings): UnderpassBlockGround {
    const additions: UnderpassBlockGround = new Map();
    if (!plan.edges.some(edge => edge.class === 'highway')) return additions;
    const edges = new Map(plan.edges.map(edge => [edge.id, edge]));
    const corners = new Map(plan.modules.placements.filter(placement => placement.moduleId.startsWith('corner:'))
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
        const half = highway[0].width / 2 + 0.5;
        const offset = grade[0].width / 2 + 0.5;
        const startPoint = turnPoint([-half, offset], node.position, turn);
        const endPoint = turnPoint([half, offset], node.position, turn);
        const first = corners.get(placementKey(startPoint, ((turn + 1) % 4) as QuarterTurn));
        const last = corners.get(placementKey(endPoint, turn));
        if (!first || !last || removed.has(first) || removed.has(last)) {
          throw invariantFailure('highway underpass has no paired corner owners', { nodeId: node.id, turn });
        }
        const [startWidth, startReturn] = cornerDimensions(first);
        const [endReturn, endWidth] = cornerDimensions(last);
        const key = [startWidth, endWidth, startReturn, endReturn, highway[0].width].join(':');
        let module = modules.get(key);
        if (!module) {
          module = UnderpassModule.build({ startWidth, endWidth, startReturn, endReturn, span: highway[0].width });
          modules.set(key, module);
        }
        const origin = turnPoint([-startReturn, 0], startPoint, turn);
        const boundary = module.boundary.map(point => turnPoint(point, origin, turn));
        if (difference([boundary], [settings.boundary]).length || intersection([boundary], obstructed.near(boundary)).length) {
          throw unsatisfiable('highway underpass cannot fit city land and pedestrian clearance', { nodeId: node.id, turn });
        }
        const id = `underpass:${node.id}:${turn}`;
        const placement: ModulePlacement = { moduleId: module.definition.id, blockId: id, origin, turn,
          count: 1, step: 2, finish: first.finish };
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
