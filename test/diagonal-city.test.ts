import { expect, it } from 'vitest';
import { generateCity } from '../src';

it('generates a complete city with sparse declared-angle streets and connected pedestrian approaches', () => {
  const city = generateCity({ seed: 'urbe', size: { width: 1000, depth: 1000 },
    features: { highways: false, trains: false, subways: false } });
  const cuts = city.streets.edges.filter(edge => edge.path[0][0] !== edge.path[1][0] && edge.path[0][1] !== edge.path[1][1]);
  expect(cuts).toHaveLength(2);
  expect(cuts.map(edge => Math.round(Math.atan2(Math.abs(edge.path[1][1] - edge.path[0][1]), Math.abs(edge.path[1][0] - edge.path[0][0])) * 180 / Math.PI)).sort())
    .toEqual([30, 45]);
  for (const edge of cuts) {
    expect([1, 2]).toContain(edge.crossSection!.lanes.length);
    for (const nodeId of [edge.from, edge.to]) {
      const node = city.streets.nodes.find(node => node.id === nodeId)!;
      expect(node.edgeIds).toHaveLength(3);
      expect(city.streets.crossings.find(crossing => crossing.nodeId === nodeId)!.segments.map(segment => segment.edgeId)).toContain(edge.id);
    }
  }
  expect(city.streets.construction!.modules!.definitions.filter(definition => definition.partitionedBeds)).toHaveLength(2);
  const modules = city.streets.construction!.modules!;
  const diagonalModules = new Set(modules.definitions.filter(definition => definition.partitionedBeds).map(definition => definition.id));
  const divided = new Set(modules.placements.filter(placement => diagonalModules.has(placement.moduleId)).map(placement => placement.blockId));
  const dimensions = city.blocks.filter(block => !divided.has(block.id)).map(block => {
    const x = block.boundary.map(point => point[0]), z = block.boundary.map(point => point[1]);
    return [Math.max(...x) - Math.min(...x), Math.max(...z) - Math.min(...z)];
  });
  expect(dimensions.some(([width, depth]) => width === depth)).toBe(true);
  expect(dimensions.some(([width, depth]) => Math.max(width, depth) / Math.min(width, depth) >= 1.3)).toBe(true);
  for (const dimension of dimensions.flat()) expect((dimension - 1) % 2).toBe(0);
  expect(city.parcels.length).toBeGreaterThan(0);
  for (const parcel of city.parcels) {
    expect(new Set(parcel.footprint.map(point => point[0])).size).toBe(2);
    expect(new Set(parcel.footprint.map(point => point[1])).size).toBe(2);
  }
}, 45000);
