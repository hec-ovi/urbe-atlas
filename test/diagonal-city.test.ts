import { expect, it } from 'vitest';
import { generateCity } from '../src';

it('publishes normal candidates while keeping the off-mode city graph, rectangles and native handoff intact', () => {
  const params = { seed: 'urbe', size: { width: 1000, depth: 1000 }, features: { subways: false } };
  const city = generateCity(params), off = generateCity({ ...params, diagonals: 'off' });
  expect(city.meta.params.diagonals).toBe('candidates');
  expect(city.streets.diagonalCandidates!.length).toBeGreaterThan(0);
  expect(off.streets.diagonalCandidates).toEqual([]);
  expect({ ...city, meta: { ...city.meta, params: off.meta.params },
    streets: { ...city.streets, diagonalCandidates: [] } }).toEqual(off);
  expect(city.streets.edges.every(edge => edge.path[0][0] === edge.path[1][0]
    || edge.path[0][1] === edge.path[1][1])).toBe(true);
  expect(city.blocks.every(block => block.boundary.length === 4
    && new Set(block.boundary.map(point => point[0])).size === 2
    && new Set(block.boundary.map(point => point[1])).size === 2)).toBe(true);
  expect(city.streets.construction!.modules!.definitions.some(definition => definition.id.startsWith('diagonal:'))).toBe(false);
  const blocks = new Map(city.blocks.map(block => [block.id, block]));
  const edges = new Set(city.streets.edges.map(edge => edge.id));
  for (const candidate of city.streets.diagonalCandidates!) {
    for (const mouth of [...candidate.mouths, ...candidate.intermediateMouths]) {
      expect(blocks.has(mouth.rectangleId)).toBe(true);
      expect(edges.has(mouth.streetId)).toBe(true);
      expect(mouth.cornerClearances.every(clearance => clearance >= 3)).toBe(true);
    }
  }
}, 45000);

it('rejects invalid public diagonal settings before generation', () => {
  for (const diagonals of ['bad', true, null]) expect(() => generateCity({ seed: 'invalid', diagonals: diagonals as 'off' }))
    .toThrow(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  expect(() => generateCity({ seed: 'invalid', diagonalCornerClearance: NaN }))
    .toThrow(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
});

it('reproduces applied cuts only through the explicit compatibility mode', () => {
  const city = generateCity({ seed: 'urbe', diagonals: 'legacy-applied', size: { width: 1000, depth: 1000 },
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
  expect(city.streets.construction!.modules!.definitions.filter(definition => definition.id.startsWith('diagonal:'))).toHaveLength(2);
  const modules = city.streets.construction!.modules!;
  const diagonalModules = new Set(modules.definitions.filter(definition => definition.id.startsWith('diagonal:')).map(definition => definition.id));
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
