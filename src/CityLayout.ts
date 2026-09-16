import type { Polygon, Vec2 } from '../schema/blueprint';
import type { DistrictKind, WealthTier } from '../schema/params';
import type { ResolvedParams } from './params/defaults';
import { GridLayout } from './streets/layout/GridLayout';
import { LayoutPlanning } from './streets/layout/LayoutPlanning';
import { ModuleGround } from './streets/construction/modules/ModuleGround';
import type { ModuleGroundRegion } from './streets/construction/modules/schema';
import { difference, intersection } from './geom/clip';
import { area } from './geom/polygon';
import { applyHighwayElevationProfiles } from './streets/Highways';
import { LEVELS } from './levels';
import { HighwayUnderpasses } from './streets/layout/underpasses';
import { CityDiagonalCandidates } from './CityDiagonalCandidates';
import { AvenueMedians } from './streets/layout/medians/AvenueMedians';

/** Connects district choices to the dimensioned street layout. */
export class CityLayout {
  static plan(params: ResolvedParams, districtAt: (point: Vec2) => { id: string; kind: DistrictKind; tier?: WealthTier }, water: Polygon[], districtCenters?: Vec2[]) {
    const design = params.streetDesign;
    const plan = GridLayout.plan({ seed: String(params.seed), size: params.size, profiles: design.profiles, highway: params.features.highways,
      moduleFormat: design.moduleFormat, districtCenters,
      diagonals: params.diagonals, diagonalCornerClearance: params.diagonalCornerClearance,
      perimeter: { profile: design.sidewalkProfiles[0], finish: params.pavingDesign?.layouts
        .find(value => value.id === params.pavingDesign!.defaultLayoutId)?.familyId ?? (design.moduleFormat === 'district' ? 'ordinary' : 'maintained') },
      sideAt: (point, kind) => {
        const district = districtAt(point);
        const assigned = design.sidewalkAssignments?.find(value => value.district === district.kind)?.[kind];
        const dense = district.kind === 'downtown' || district.kind === 'commercial';
        const index = dense ? 2 : district.kind === 'mixed' || kind === 'road' ? 1 : 0;
        const profile = assigned ? design.sidewalkProfiles.find(value => value.id === assigned)!
          : design.sidewalkProfiles[Math.min(index, design.sidewalkProfiles.length - 1)];
        const finishId = params.pavingDesign?.districtLayouts.find(value => value.districtId === district.id)?.layoutId
          ?? params.pavingDesign?.defaultLayoutId;
        const finish = params.pavingDesign?.layouts.find(value => value.id === finishId)?.familyId
          ?? (design.moduleFormat !== 'district' ? 'maintained' : district.kind === 'industrial' ? 'industrial-yellow'
            : district.tier === 'high_rich' ? 'luxury-blue' : district.tier === 'rich' ? 'luxury-red' : 'ordinary');
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
    const waterExcludedBlocks = plan.blocks.filter(block => water.length
      && intersection([block.outer], water).some(polygon => area(polygon) > 0))
      .map(block => ({ ownerId: block.id, boundary: block.outer }));
    const excludedBlockIds = new Set(waterExcludedBlocks.map(block => block.ownerId));
    plan.blocks = plan.blocks.filter(block => !excludedBlockIds.has(block.id));
    const kept = new Map(plan.blocks.map((block, index) => [block.id, `b${index}`]));
    plan.blocks.forEach(block => { block.id = kept.get(block.id)!; });
    for (const frontage of plan.modules.frontages ?? []) kept.set(frontage.id, frontage.id);
    plan.modules.placements = plan.modules.placements.filter(placement => kept.has(placement.blockId));
    plan.modules.placements.forEach(placement => { placement.blockId = kept.get(placement.blockId)!; });
    if (plan.modules.parking) {
      plan.modules.parking = plan.modules.parking.filter(bay => kept.has(bay.blockId));
      plan.modules.parking.forEach(bay => { bay.blockId = kept.get(bay.blockId)!; });
    }
    const waterExcludedCorners = plan.planning.corners.filter(corner => !kept.has(corner.ownerId));
    LayoutPlanning.retain(plan.planning, kept);
    const boundary: Polygon = [[0, 0], [params.size.width, 0], [params.size.width, params.size.depth], [0, params.size.depth]];
    plan.diagonalCandidates = CityDiagonalCandidates.retain(plan.diagonalCandidates, kept, boundary, water);
    const underpasses = HighwayUnderpasses.apply(plan, {
      boundary,
      water, waterExcludedCorners, clearHeight: design.crossings!.pedestrianClearance,
    });
    const medianConstruction = AvenueMedians.build(plan, water);
    const footprints = medianConstruction.medians.map(median => median.footprint);
    if (footprints.length) {
      plan.roadway = difference(plan.roadway, footprints);
      plan.modules.definitions.push(...medianConstruction.definitions);
      plan.modules.placements.push(...medianConstruction.placements);
      plan.modules.frontages = [...(plan.modules.frontages ?? []), ...medianConstruction.owners];
      plan.planning.frontages.push(...medianConstruction.frontages);
    }
    const cover = ModuleGround.cover(plan.modules);
    const byBlock = new Map<string, ModuleGroundRegion[]>(plan.blocks.map(block => [block.id, []]));
    cover.forEach(region => byBlock.get(region.blockId)?.push(region));
    underpasses.forEach((regions, blockId) => byBlock.get(blockId)?.push(...regions));
    const blocks = plan.blocks.map(block => ({
      boundary: block.outer, boundaryRegions: [block.outer], interior: block.interiors ?? [block.interior], edgeIds: block.edgeIds,
      sidewalk: byBlock.get(block.id)!.filter(region => region.surface === 'sidewalk').map(region => region.polygon),
      curb: byBlock.get(block.id)!.filter(region => region.surface === 'curb').map(region => region.polygon),
      returns: byBlock.get(block.id)!.filter(region => region.surface === 'roadway').map(region => region.polygon),
    }));
    return { ...plan, waterExcludedBlocks, medians: medianConstruction.medians, builtBlocks: blocks, cover };
  }
}
