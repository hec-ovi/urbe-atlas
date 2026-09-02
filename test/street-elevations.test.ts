import { describe, expect, it } from 'vitest';
import { generateCity } from '../src';
import { checkStreetElevations } from '../src/invariants/elevations';
import type { CityBlueprint } from '../schema/blueprint';

let cached: CityBlueprint | undefined;
const city = (): CityBlueprint => (cached ??= generateCity({ seed: 'urbe', size: { width: 3000, depth: 3000 } }));

describe('street elevation profiles', () => {
  it('publishes driveable ramp heights and separates overpasses from grade turns', () => {
    const bp = city();
    const rampEdges = bp.streets.edges.filter((edge) =>
      edge.class === 'highway' && edge.elevationProfile.some((point) => point.level < edge.level));
    expect(rampEdges.length).toBeGreaterThan(0);
    for (const edge of rampEdges) {
      expect(edge.elevationProfile[0].distance).toBe(0);
      expect(edge.elevationProfile[edge.elevationProfile.length - 1].distance).toBeGreaterThan(0);
      for (let i = 1; i < edge.elevationProfile.length; i++) {
        expect(edge.elevationProfile[i].distance).toBeGreaterThan(edge.elevationProfile[i - 1].distance);
      }
    }

    const separated = bp.streets.nodes.filter((node) => node.connections.length > 1);
    expect(separated.length).toBeGreaterThan(0);
    for (const node of separated) {
      expect(new Set(node.connections.map((connection) => connection.level)).size).toBe(node.connections.length);
      expect(node.connections.flatMap((connection) => connection.edgeIds).sort()).toEqual([...node.edgeIds].sort());
    }
  });

  it('rejects a profile that ends before its road does', () => {
    const broken = structuredClone(city()) as CityBlueprint;
    broken.streets.edges[0].elevationProfile.pop();
    expect(() => checkStreetElevations(broken)).toThrow(/does not span its path/);
  });

  it('rejects a grade road grouped into an elevated highway turn', () => {
    const broken = structuredClone(city()) as CityBlueprint;
    const node = broken.streets.nodes.find((candidate) => candidate.connections.length > 1)!;
    node.connections[0].edgeIds.push(node.connections[1].edgeIds.pop()!);
    if (node.connections[1].edgeIds.length === 0) node.connections.pop();
    expect(() => checkStreetElevations(broken)).toThrow(/wrong level|incomplete or duplicate/);
  });
});
