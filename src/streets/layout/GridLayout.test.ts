import { describe, expect, it } from 'vitest';
import { GridLayout } from './GridLayout';
import type { GridLayoutInput } from './schema';
import type { Polygon } from '../../../schema/blueprint';

const area = (ring: Polygon) => ring.reduce((sum, p, i) => {
  const q = ring[(i + 1) % ring.length];
  return sum + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;
const input: GridLayoutInput = {
  seed: 'modules', size: { width: 1000, depth: 800 },
  profiles: [1, 2, 4].map(count => ({ id: `lanes:${count}`, classes: [count === 4 ? 'road' : 'street'],
    lanes: Array.from({ length: count }, (_, i) => ({ width: 3.5, direction: i < count / 2 ? 'forward' : 'backward' })),
    shoulders: { left: 0, right: 0 } })),
  sideAt: (point, kind) => ({ finish: 'maintained', profile: {
    id: kind === 'road' ? 'wide' : point[0] < 500 ? 'normal' : 'narrow',
    curb: 0.2, border: 0, furnishing: 0, walking: kind === 'road' ? 6 : point[0] < 500 ? 4 : 2, frontage: 0,
    edge: { curbRise: 0.2, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' } } },
  } }),
};

describe('GridLayout public plan', () => {
  it('connects whole-panel blocks through one street graph and covers its rectangle exactly', () => {
    const plan = GridLayout.plan(input);
    const nodes = new Map(plan.nodes.map(node => [node.id, node]));
    const edges = new Map(plan.edges.map(edge => [edge.id, edge]));
    const visited = new Set<string>();
    const pending = [plan.nodes[0].id];
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const edgeId of nodes.get(id)!.edgeIds) {
        const edge = edges.get(edgeId)!;
        pending.push(edge.from === id ? edge.to : edge.from);
      }
    }
    expect(visited.size).toBe(plan.nodes.length);
    expect(new Set(plan.edges.map(edge => edge.crossSection!.lanes.length))).toEqual(new Set([1, 2, 4]));
    for (const edge of plan.edges) {
      expect(edge.path).toEqual([nodes.get(edge.from)!.position, nodes.get(edge.to)!.position]);
      expect(edge.path[0][0] === edge.path[1][0] || edge.path[0][1] === edge.path[1][1]).toBe(true);
      expect(edge.sidewalk.left).toBe(edge.crossSection!.sidewalks.left.geometry!.pavedWidth + 0.5);
    }
    for (const block of plan.blocks) {
      expect(block.edgeIds.every(id => edges.has(id))).toBe(true);
      const width = block.outer[1][0] - block.outer[0][0] - 1;
      const depth = block.outer[2][1] - block.outer[1][1] - 1;
      expect(width % 2).toBe(0);
      expect(depth % 2).toBe(0);
      expect(area(block.interior)).toBeGreaterThan(0);
    }
    expect(plan.roadway.reduce((sum, ring) => sum + area(ring), 0)
      + plan.blocks.reduce((sum, block) => sum + area(block.outer), 0))
      .toBeCloseTo((plan.bounds.max[0] - plan.bounds.min[0]) * (plan.bounds.max[1] - plan.bounds.min[1]), 8);
    const rectangles = [...plan.roadway, ...plan.blocks.map(block => block.outer)];
    for (let i = 0; i < rectangles.length; i++) for (let j = i + 1; j < rectangles.length; j++) {
      const a = rectangles[i], b = rectangles[j];
      expect(a[2][0] <= b[0][0] || b[2][0] <= a[0][0] || a[2][1] <= b[0][1] || b[2][1] <= a[0][1]).toBe(true);
    }
    expect(plan.bounds.min.every(value => value > 0)).toBe(true);
    expect(plan.bounds.max[0]).toBeLessThan(input.size.width);
    expect(plan.bounds.max[1]).toBeLessThan(input.size.depth);
  });

  it('repeats catalog pieces deterministically and places sparse, clear parking on wide frontages', () => {
    const plan = GridLayout.plan(input);
    expect(GridLayout.plan(input)).toEqual(plan);
    expect(GridLayout.plan({ ...input, seed: 'other' })).not.toEqual(plan);
    const parking = plan.modules.parking!;
    expect(parking.length).toBeGreaterThan(0);
    expect(parking.length).toBeLessThan(plan.blocks.length / 3);
    expect(new Set(parking.map(bay => bay.blockId)).size).toBe(parking.length);
    for (const bay of parking) {
      expect(bay.start % 2).toBe(0);
      expect(bay.start).toBeGreaterThanOrEqual(6);
      expect(bay.slots.map(area)).toEqual(Array(bay.slotCount).fill(8));
    }
    const definitions = new Set(plan.modules.definitions.map(definition => definition.id));
    expect(plan.modules.placements.every(placement => definitions.has(placement.moduleId))).toBe(true);
    expect(plan.modules.placements.reduce((sum, placement) => sum + placement.count, 0)).toBeGreaterThan(definitions.size * 100);
  });

  it('rejects incompatible profiles and sizes that cannot hold its blocks', () => {
    expect(() => GridLayout.plan({ ...input, size: { width: 100, depth: 800 } })).toThrow(/cannot fit/);
    expect(() => GridLayout.plan({ ...input, profiles: [] })).toThrow(/road profiles/);
    expect(() => GridLayout.plan({ ...input, sideAt: () => ({ ...input.sideAt([0, 0], 'street'),
      profile: { ...input.sideAt([0, 0], 'street').profile, walking: 3 },
    }) })).toThrow(/2\/4\/6/);
  });
});
