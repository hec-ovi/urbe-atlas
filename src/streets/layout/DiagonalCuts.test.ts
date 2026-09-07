import { expect, it } from 'vitest';
import { GridLayout } from './GridLayout';
import { resolveStreetDesign } from '../construction/Design';
import { length } from '../../geom/polyline';

it('adds sparse declared-angle cuts with connected split frontages and preserved run stations', () => {
  const design = resolveStreetDesign();
  const plan = GridLayout.plan({ seed: 'urbe', size: { width: 1000, depth: 1000 }, profiles: design.profiles,
    sideAt: () => ({ profile: design.sidewalkProfiles[1], finish: 'plain' }) });
  const cuts = plan.edges.filter(edge => edge.path[0][0] !== edge.path[1][0] && edge.path[0][1] !== edge.path[1][1]);
  expect(cuts).toHaveLength(2);
  expect(cuts.map(edge => Math.round(Math.atan2(Math.abs(edge.path[1][1] - edge.path[0][1]), Math.abs(edge.path[1][0] - edge.path[0][0])) * 180 / Math.PI)).sort())
    .toEqual([30, 45]);
  const nodes = new Map(plan.nodes.map(node => [node.id, node]));
  const edges = new Map(plan.edges.map(edge => [edge.id, edge]));
  for (const edge of plan.edges) {
    expect(edge.path).toEqual([nodes.get(edge.from)!.position, nodes.get(edge.to)!.position]);
    expect(nodes.get(edge.from)!.edgeIds).toContain(edge.id);
    expect(nodes.get(edge.to)!.edgeIds).toContain(edge.id);
  }
  for (const run of plan.runs) {
    let station = 0;
    for (const member of run.edges) {
      expect(member.start).toBeCloseTo(station, 9);
      expect(member.end - member.start).toBeCloseTo(length(edges.get(member.edgeId)!.path), 9);
      station = member.end;
    }
    expect(station).toBeCloseTo(run.length, 9);
  }
  for (const edge of cuts) {
    for (const id of [edge.from, edge.to]) {
      const node = nodes.get(id)!;
      expect(node.edgeIds).toHaveLength(3);
      for (const arm of node.edgeIds.filter(id => id !== edge.id)) expect(length(edges.get(arm)!.path)).toBeGreaterThanOrEqual(40 - 1e-9);
    }
    const block = plan.blocks.find(block => block.edgeIds.includes(edge.id))!;
    expect(block.interiors).toHaveLength(2);
    const placed = plan.modules.placements.filter(placement => placement.blockId === block.id);
    expect(placed).toHaveLength(1);
    expect(placed[0].moduleId).toMatch(/^diagonal:/);
    expect(plan.modules.parking?.some(bay => bay.blockId === block.id) ?? false).toBe(false);
  }
}, 20000);
