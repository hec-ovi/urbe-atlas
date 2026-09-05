import { expect, it } from 'vitest';
import { generateCity } from '../src';
import { regularCityParams } from './fixtures/regular-city';

it('builds regular streets and rectangular footprints on exact shared world axes', () => {
  const city = generateCity(regularCityParams);
  expect(city.meta.gridAngle).toBe(0);
  expect(city.meta.buildingGrid.angle).toBe(0);
  let checked = 0;
  const axes = new Set<string>();
  for (const edge of city.streets.edges) {
    for (let i = 1; i < edge.path.length; i++) {
      const a = edge.path[i - 1], b = edge.path[i];
      const x = b[0] - a[0], z = b[1] - a[1];
      expect(x === 0 || z === 0, `${edge.id} segment ${i - 1}`).toBe(true);
      expect(x !== 0 || z !== 0, `${edge.id} segment ${i - 1}`).toBe(true);
      axes.add(x === 0 ? 'z' : 'x');
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(0);
  expect(axes).toEqual(new Set(['x', 'z']));
  expect(city.blocks.length).toBeGreaterThan(0);
  expect(city.parcels.length).toBeGreaterThan(0);
  for (const parcel of city.parcels) {
    expect(parcel.footprint).toHaveLength(4);
    expect(new Set(parcel.footprint.map(point => point.join(','))).size).toBe(4);
    expect(new Set(parcel.footprint.map(point => point[0])).size).toBe(2);
    expect(new Set(parcel.footprint.map(point => point[1])).size).toBe(2);
  }
});

it('retains real T contacts and varied block dimensions in the fixed one-kilometre regular city', () => {
  const city = generateCity({ ...regularCityParams, seed: 'urbe', size: { width: 1000, depth: 1000 }, districtCount: undefined });
  const edges = new Map(city.streets.edges.map(edge => [edge.id, edge]));
  const junctions = city.streets.nodes.filter(node => node.edgeIds.length === 3);
  expect(junctions.length).toBeGreaterThan(0);
  for (const node of junctions) {
    const directions = node.edgeIds.map(id => {
      const edge = edges.get(id)!;
      const point = edge.from === node.id ? edge.path[1] : edge.path.at(-2)!;
      const dx = point[0] - node.position[0], dz = point[1] - node.position[1];
      expect(dx === 0 || dz === 0, `${node.id}:${id}`).toBe(true);
      expect(dx !== 0 || dz !== 0, `${node.id}:${id}`).toBe(true);
      return [Math.sign(dx), Math.sign(dz)];
    });
    expect(new Set(directions.map(direction => direction.join(','))).size).toBe(3);
    expect(directions.some(([x, z]) => directions.some(([a, b]) => a === -x && b === -z))).toBe(true);
  }
  const dimensions = city.blocks.map(block => {
    const x = block.boundary.map(point => point[0]), z = block.boundary.map(point => point[1]);
    return [Math.max(...x) - Math.min(...x), Math.max(...z) - Math.min(...z)].map(value => Math.round(value * 1000));
  });
  expect(new Set(dimensions.map(pair => pair.join(','))).size).toBeGreaterThan(1);
  expect(dimensions.some(([width, depth]) => width !== depth)).toBe(true);
});
