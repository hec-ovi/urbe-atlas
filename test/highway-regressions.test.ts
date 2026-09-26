import { beforeAll, expect, it } from 'vitest';
import { generateCity } from '../src/generate';
import type { CityBlueprint, StreetEdge } from '../schema/blueprint';
import { checkHighwayStructures } from '../src/invariants/highways';
import { distanceTo, length, pointAt, projectArc } from '../src/geom/polyline';
import { highwayEnvelopes, applyHighwayElevationProfiles, levelAt } from '../src/streets/Highways';

let city: CityBlueprint;
beforeAll(() => { city = generateCity({ seed: 'undertow', size: { width: 1000, depth: 1000 }, features: { highways: true } }); });

it('keeps grade approaches flat beyond their junctions and maps ramp stretches to their real feet', () => {
  const edges = new Map(city.streets.edges.map(e => [e.id, e]));
  for (const structure of city.streets.highwayStructures) {
    expect(structure.approaches!.start).toBeGreaterThan(7);
    expect(structure.approaches!.end).toBeGreaterThan(7);
    for (const ramp of city.architecture.ramps) {
      const start = ramp.stretches[0], end = ramp.stretches.at(-1)!;
      expect(start.from).not.toBe(0);
      expect(levelAt(edges.get(start.edgeId)!.elevationProfile, start.from)).toBeCloseTo(0, 8);
      expect(levelAt(edges.get(end.edgeId)!.elevationProfile, end.to)).toBeCloseTo(structure.level, 8);
      expect(distanceTo(structure.path, pointAt(edges.get(start.edgeId)!.path, start.from))).toBeLessThan(1e-7);
    }
  }
  const reversed: StreetEdge[] = structuredClone(city.streets.edges);
  for (const edge of reversed.filter(e => e.class === 'highway')) {
    [edge.from, edge.to] = [edge.to, edge.from]; edge.path.reverse();
  }
  applyHighwayElevationProfiles(reversed);
  for (const edge of reversed.filter(e => e.class === 'highway')) for (const knot of edge.elevationProfile) {
    const original = edges.get(edge.id)!;
    expect(knot.level).toBeCloseTo(levelAt(original.elevationProfile, length(edge.path) - knot.distance), 8);
  }
  expect(highwayEnvelopes(reversed)).toHaveLength(city.streets.highwayStructures.length);
});

it('carries both ramps at the support pitch and publishes clear parapets and planting', () => {
  for (const structure of city.streets.highwayStructures) {
    expect(structure.barriers).toEqual({ left: { height: 1.1, width: 0.3 }, right: { height: 1.1, width: 0.3 } });
    const stations = structure.supports.map(s => projectArc(structure.path, s.position));
    expect(stations[0]).toBeLessThan(30 + structure.deckThickness * structure.ramps.start / structure.level + 1);
    expect(stations.some(s => s < structure.ramps.start)).toBe(true);
    expect(stations.some(s => s > length(structure.path) - structure.ramps.end)).toBe(true);
    const spans = [0, ...stations, length(structure.path)];
    for (let i = 2; i < spans.length - 1; i++) expect(spans[i] - spans[i - 1]).toBeLessThanOrEqual(30.002);
    expect(city.streets.planting.every(p => distanceTo(structure.path, p.position) > structure.width / 2)).toBe(true);
  }
  expect(() => checkHighwayStructures(city)).not.toThrow();
  const blocked = structuredClone(city);
  blocked.streets.planting.push({ edgeId: blocked.streets.edges[0].id, kind: 'tree', spacing: 8,
    position: pointAt(blocked.streets.highwayStructures[0].path, 100) });
  expect(() => checkHighwayStructures(blocked)).toThrow(/planting anchor/);
  const unsupported = structuredClone(city);
  unsupported.streets.highwayStructures[0].supports = unsupported.streets.highwayStructures[0].supports.filter(s => s.top === 7);
  expect(() => checkHighwayStructures(unsupported)).toThrow(/unsupported/);
  const parapet = structuredClone(city);
  parapet.streets.highwayStructures[0].barriers!.left.height = 0;
  expect(() => checkHighwayStructures(parapet)).toThrow(/barrier/);
});
