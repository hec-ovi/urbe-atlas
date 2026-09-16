import { expect, it } from 'vitest';
import { GridLayout } from '../GridLayout';
import { resolveStreetDesign } from '../../construction/Design';
import { districtStreetDesign } from '../../construction/DistrictDesign';
import { applyHighwayElevationProfiles } from '../../construction/highway';
import { ModuleGround } from '../../construction/modules/ModuleGround';
import { difference } from '../../../geom/clip';
import { area } from '../../../geom/polygon';
import { HighwayUnderpasses } from './HighwayUnderpasses';

it.each(['source', 'district'] as const)('retains complete %s ground and authored handoffs across the highway', format => {
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
  const before = structuredClone(plan.planning);
  const originalGround = [...ModuleGround.cover(plan.modules).map(region => region.polygon), ...plan.roadway];
  HighwayUnderpasses.apply(plan, { boundary: [[0, 0], [800, 0], [800, 800], [0, 800]], water: [], clearHeight: 2.5 });
  const ground = [...ModuleGround.cover(plan.modules).map(region => region.polygon), ...plan.roadway];
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
