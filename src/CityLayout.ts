import type { Polygon, Vec2 } from '../schema/blueprint';
import type { DistrictKind } from '../schema/params';
import type { ResolvedParams } from './params/defaults';
import { GridLayout } from './streets/layout/GridLayout';
import { ModuleGround } from './streets/construction/modules/ModuleGround';
import type { ModuleGroundRegion } from './streets/construction/modules/schema';
import { intersection } from './geom/clip';
import { area } from './geom/polygon';
import { applyHighwayElevationProfiles } from './streets/Highways';
import { LEVELS } from './levels';

/** Connects district choices to the dimensioned street layout. */
export class CityLayout {
  static plan(params: ResolvedParams, districtAt: (point: Vec2) => { id: string; kind: DistrictKind }, water: Polygon[]) {
    const design = params.streetDesign;
    const plan = GridLayout.plan({ seed: String(params.seed), size: params.size, profiles: design.profiles, highway: params.features.highways,
      perimeter: { profile: design.sidewalkProfiles[0], finish: params.pavingDesign?.layouts
        .find(value => value.id === params.pavingDesign!.defaultLayoutId)?.familyId ?? 'maintained' },
      sideAt: (point, kind) => {
        const district = districtAt(point);
        const assigned = design.sidewalkAssignments?.find(value => value.district === district.kind)?.[kind];
        const dense = district.kind === 'downtown' || district.kind === 'commercial';
        const index = dense ? 2 : district.kind === 'mixed' || kind === 'road' ? 1 : 0;
        const profile = assigned ? design.sidewalkProfiles.find(value => value.id === assigned)!
          : design.sidewalkProfiles[Math.min(index, design.sidewalkProfiles.length - 1)];
        const finishId = params.pavingDesign?.districtLayouts.find(value => value.districtId === district.id)?.layoutId
          ?? params.pavingDesign?.defaultLayoutId;
        const finish = params.pavingDesign?.layouts.find(value => value.id === finishId)?.familyId ?? 'maintained';
        return { profile, finish };
      },
    });
    if (plan.highwayRunId) {
      const run = plan.runs.find(value => value.id === plan.highwayRunId)!;
      const ids = new Set(run.edges.map(member => member.edgeId));
      run.profileId = 'highway';
      for (const edge of plan.edges) if (ids.has(edge.id)) {
        edge.class = 'highway'; edge.level = LEVELS.highway; edge.sidewalk = { left: 0, right: 0 };
        delete edge.crossSection;
      }
      applyHighwayElevationProfiles(plan.edges);
    }
    // A water edge keeps complete modules; its intersected block remains open land.
    plan.blocks = plan.blocks.filter(block => !water.length
      || intersection([block.outer], water).reduce((sum, polygon) => sum + area(polygon), 0) === 0);
    const kept = new Map(plan.blocks.map((block, index) => [block.id, `b${index}`]));
    plan.blocks.forEach(block => { block.id = kept.get(block.id)!; });
    for (const frontage of plan.modules.frontages ?? []) kept.set(frontage.id, frontage.id);
    plan.modules.placements = plan.modules.placements.filter(placement => kept.has(placement.blockId));
    plan.modules.placements.forEach(placement => { placement.blockId = kept.get(placement.blockId)!; });
    if (plan.modules.parking) {
      plan.modules.parking = plan.modules.parking.filter(bay => kept.has(bay.blockId));
      plan.modules.parking.forEach(bay => { bay.blockId = kept.get(bay.blockId)!; });
    }
    const cover = ModuleGround.cover(plan.modules);
    const byBlock = new Map<string, ModuleGroundRegion[]>(plan.blocks.map(block => [block.id, []]));
    cover.forEach(region => byBlock.get(region.blockId)?.push(region));
    const blocks = plan.blocks.map(block => ({
      boundary: block.outer, boundaryRegions: [block.outer], interior: block.interiors ?? [block.interior], edgeIds: block.edgeIds,
      sidewalk: byBlock.get(block.id)!.filter(region => region.surface === 'sidewalk').map(region => region.polygon),
      curb: byBlock.get(block.id)!.filter(region => region.surface === 'curb').map(region => region.polygon),
      returns: byBlock.get(block.id)!.filter(region => region.surface === 'roadway').map(region => region.polygon),
    }));
    return { ...plan, builtBlocks: blocks, cover };
  }
}
