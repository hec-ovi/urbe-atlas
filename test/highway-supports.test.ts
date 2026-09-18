/**
 * Support placement through the public entry point: a highway deck is carried
 * from both edges of every crossing street, on seeds that used to have nowhere
 * to stand (CONTRACT.md, "Its 2 x 2 m supports stand under the flat deck").
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateCity } from '../src';
import { HIGHWAY_DECK } from '../src/streets/Highways';
import { length as pathLength } from '../src/geom/polyline';
import { closestOnSegment, dist } from '../src/geom/vec';
import type { AtlasParams } from '../schema/params';
import type { CityBlueprint, HighwayStructure, Vec2 } from '../schema/blueprint';

const params = (): AtlasParams => JSON.parse(readFileSync(new URL('./fixtures/highway-support.params.json', import.meta.url), 'utf8'));

describe('highway supports', () => {
  it('carries every flat deck at the published pitch on a seed that had nowhere to stand', () => {
    const city = generateCity(params());
    expect(city.streets.highwayStructures.length).toBeGreaterThan(0);
    for (const structure of city.streets.highwayStructures) {
      const stations = supportStations(structure);
      expect(stations.length).toBeGreaterThan(0);
      const flatStart = structure.ramps.start;
      const flatEnd = pathLength(structure.path) - structure.ramps.end;
      const spans = [...stations, flatEnd].map((station, index) => station - (index ? stations[index - 1]! : flatStart));
      expect(Math.max(...spans)).toBeLessThanOrEqual(HIGHWAY_DECK.supportPitch + 0.002);
      // Two columns never share ground: each stands its own square clear of the last.
      const gaps = stations.slice(1).map((station, index) => station - stations[index]!);
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(HIGHWAY_DECK.supportSize);
    }
  }, 20000); // One complete 1 km generation and its invariants.
});

/** Where each column stands along its run. */
function supportStations(structure: HighwayStructure): number[] {
  return structure.supports.map((support) => distanceAlong(structure.path, support.position));
}

function distanceAlong(path: CityBlueprint['streets']['highwayStructures'][number]['path'], point: Vec2): number {
  let before = 0;
  let best = { distance: Infinity, along: 0 };
  for (let i = 1; i < path.length; i++) {
    const hit = closestOnSegment(point, path[i - 1]!, path[i]!).point;
    const distance = dist(point, hit);
    if (distance < best.distance) best = { distance, along: before + dist(path[i - 1]!, hit) };
    before += dist(path[i - 1]!, path[i]!);
  }
  return best.along;
}
