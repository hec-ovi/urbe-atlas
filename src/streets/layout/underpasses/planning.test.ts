import { expect, it } from 'vitest';
import { GridLayout } from '../GridLayout';
import { resolveStreetDesign } from '../../construction/Design';
import { districtStreetDesign } from '../../construction/DistrictDesign';
import { applyHighwayElevationProfiles } from '../../construction/highway';
import { ModuleGround } from '../../construction/modules/ModuleGround';
import { difference, intersection } from '../../../geom/clip';
import { area } from '../../../geom/polygon';
import { HighwayUnderpasses } from './HighwayUnderpasses';
import type { ModuleFormat } from '../../construction/modules/schema';
import type { GridLayoutPlan } from '../schema';
import type { Polygon } from '../../../../schema/blueprint';

const boundary: Polygon = [[0, 0], [800, 0], [800, 800], [0, 800]];
const groundOf = (plan: GridLayoutPlan) => [...ModuleGround.cover(plan.modules).map(region => region.polygon), ...plan.roadway];

function highwayPlan(format: ModuleFormat): GridLayoutPlan {
  const design = format === 'district' ? districtStreetDesign() : resolveStreetDesign();
  const profile = design.sidewalkProfiles[format === 'district' ? 0 : 2];
  const plan = GridLayout.plan({ seed: 'underpass-supports', size: { width: 800, depth: 800 },
    moduleFormat: format, profiles: design.profiles, highway: true, diagonals: 'off',
    sideAt: () => ({ profile, finish: 'maintained' }) });
  const highway = new Set(plan.runs.find(run => run.id === plan.highwayRunId)!.edges.map(edge => edge.edgeId));
  for (const edge of plan.edges) if (highway.has(edge.id)) {
    edge.class = 'highway'; edge.level = 8; edge.sidewalk = { left: 0, right: 0 };
    delete edge.crossSection;
  }
  applyHighwayElevationProfiles(plan.edges);
  return plan;
}

it.each(['source', 'district'] as const)('retains complete %s ground and authored handoffs across the highway', format => {
  const plan = highwayPlan(format);
  const before = structuredClone(plan.planning);
  const originalGround = groundOf(plan);
  HighwayUnderpasses.apply(plan, { boundary, water: [], clearHeight: 2.5 });
  const ground = groundOf(plan);
  expect(difference(originalGround, ground)).toEqual([]);
  expect(difference(ground, originalGround)).toEqual([]);
  expect(ground.reduce((sum, polygon) => sum + area(polygon), 0))
    .toBeCloseTo(originalGround.reduce((sum, polygon) => sum + area(polygon), 0), 6);
  expect(plan.planning.protected.length).toBeGreaterThan(0);
  for (const record of plan.planning.protected) {
    expect(record.replacedCornerIds).toHaveLength(2);
    expect(record.replacedCornerIds.every(id => before.corners.some(corner => corner.id === id))).toBe(true);
    expect(record.replacedCornerIds.some(id => plan.planning.corners.some(corner => corner.id === id))).toBe(false);
    expect(plan.modules.frontages!.some(frontage => frontage.id === record.ownerId)).toBe(true);
    const spans = plan.planning.frontages.filter(frontage => frontage.ownerId === record.ownerId);
    expect(spans).toHaveLength(2);
    expect(spans.map(frontage => [frontage.pavedWidth, frontage.curbWidth, frontage.gutterWidth]))
      .toEqual(Array.from({ length: 2 }, () => format === 'district' ? [4.2, 0.2, 0.5] : [6, 0.2, 0.3]));
    expect(spans.every(frontage => frontage.cornerIds.every(id => id === null))).toBe(true);
    expect(spans.flatMap(frontage => frontage.edgeIds).sort()).toEqual([...record.edgeIds].sort());
    for (const frontage of plan.planning.frontages.filter(frontage => frontage.ownerId !== record.ownerId)) {
      const old = before.frontages.find(value => value.id === frontage.id);
      if (!old) continue;
      if (old.cornerIds[0] && record.replacedCornerIds.includes(old.cornerIds[0])) expect(frontage.start).toEqual(old.moduleStationOrigin);
      if (old.cornerIds[1] && record.replacedCornerIds.includes(old.cornerIds[1])) expect(frontage.end).toEqual(old.moduleStationEnd);
    }
  }
});

it.each([1, 2])('retains shore ground when %i opposite block owners are explicitly excluded by water', count => {
  const plan = highwayPlan('district');
  const highway = plan.edges.find(edge => edge.class === 'highway'
    && [edge.from, edge.to].every(id => plan.nodes.find(node => node.id === id)!.edgeIds.length === 4))!;
  const adjacent = plan.blocks.filter(block => block.edgeIds.includes(highway.id));
  expect(adjacent).toHaveLength(2);
  const removed = adjacent.slice(0, count), removedIds = new Set(removed.map(block => block.id));
  const waterExcludedCorners = plan.planning.corners.filter(corner => removedIds.has(corner.ownerId));
  const opposite = plan.planning.frontages.find(frontage => frontage.ownerId === adjacent[1].id && frontage.edgeIds.includes(highway.id))!;
  const survivingCorners = count === 1 ? structuredClone(plan.planning.corners.filter(corner => opposite.cornerIds.includes(corner.id))) : [];
  const settings = { boundary, water: removed.map(block => block.outer), waterExcludedCorners, clearHeight: 2.5 };
  plan.blocks = plan.blocks.filter(block => !removedIds.has(block.id));
  plan.modules.placements = plan.modules.placements.filter(placement => !removedIds.has(placement.blockId));
  plan.modules.parking = plan.modules.parking?.filter(parking => !removedIds.has(parking.blockId));
  plan.planning.corners = plan.planning.corners.filter(corner => !removedIds.has(corner.ownerId));
  plan.planning.frontages = plan.planning.frontages.filter(frontage => !removedIds.has(frontage.ownerId));
  if (count === 1) {
    const corrupt = structuredClone(plan), missing = survivingCorners[0];
    corrupt.modules.placements = corrupt.modules.placements.filter(placement => !(placement.blockId === missing.ownerId
      && placement.moduleId === missing.placement.moduleId && placement.turn === missing.placement.turn
      && placement.origin.every((value, axis) => value === missing.placement.origin[axis])));
    expect(() => HighwayUnderpasses.apply(corrupt, settings)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    expect(() => HighwayUnderpasses.apply(structuredClone(plan), { ...settings, waterExcludedCorners: [...waterExcludedCorners, missing] }))
      .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  }
  const before = groundOf(plan);
  HighwayUnderpasses.apply(plan, settings);
  const after = groundOf(plan);
  expect(difference(before, after)).toEqual([]);
  expect(difference(after, before)).toEqual([]);
  expect(intersection(after, settings.water)).toEqual([]);
  expect(after.reduce((sum, polygon) => sum + area(polygon), 0))
    .toBeCloseTo(before.reduce((sum, polygon) => sum + area(polygon), 0), 6);
  for (const corner of survivingCorners) expect(plan.planning.corners).toContainEqual(corner);
  const excludedIds = new Set(waterExcludedCorners.map(corner => corner.id));
  expect(plan.planning.protected.flatMap(record => record.replacedCornerIds).some(id => excludedIds.has(id))).toBe(false);
});
