import { expect, it } from 'vitest';
import { GridLayout } from '../GridLayout';
import { resolveStreetDesign } from '../../construction/Design';
import { applyHighwayElevationProfiles } from '../../construction/highway';
import { HighwayUnderpasses } from './HighwayUnderpasses';

it('replaces corner supports with explicit underpass spans and retained source handoffs', () => {
  const design = resolveStreetDesign();
  const plan = GridLayout.plan({ seed: 'underpass-supports', size: { width: 800, depth: 800 },
    profiles: design.profiles, highway: true, diagonals: 'off',
    sideAt: () => ({ profile: design.sidewalkProfiles[2], finish: 'maintained' }) });
  const highway = new Set(plan.runs.find(run => run.id === plan.highwayRunId)!.edges.map(edge => edge.edgeId));
  for (const edge of plan.edges) if (highway.has(edge.id)) {
    edge.class = 'highway'; edge.level = 8; edge.sidewalk = { left: 0, right: 0 };
    delete edge.crossSection;
  }
  applyHighwayElevationProfiles(plan.edges);
  const before = structuredClone(plan.planning);
  HighwayUnderpasses.apply(plan, { boundary: [[0, 0], [800, 0], [800, 800], [0, 800]], water: [], clearHeight: 2.5 });
  expect(plan.planning.protected.length).toBeGreaterThan(0);
  for (const record of plan.planning.protected) {
    expect(record.replacedCornerIds).toHaveLength(2);
    expect(record.replacedCornerIds.every(id => before.corners.some(corner => corner.id === id))).toBe(true);
    expect(record.replacedCornerIds.some(id => plan.planning.corners.some(corner => corner.id === id))).toBe(false);
    expect(plan.modules.frontages!.some(frontage => frontage.id === record.ownerId)).toBe(true);
    const spans = plan.planning.frontages.filter(frontage => frontage.ownerId === record.ownerId);
    expect(spans).toHaveLength(2);
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
