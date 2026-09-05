import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { StreetCorridors } from '../StreetCorridors';
import { intersection } from '../../../geom/clip';
import { area } from '../../../geom/polygon';
import type { SectionedStreetEdge } from '../schema/sections';

const input = JSON.parse(readFileSync(new URL('./fixtures/asymmetric-bend.input.json', import.meta.url), 'utf8')) as { edges: SectionedStreetEdge[] };
const expected = readFileSync(new URL('./fixtures/asymmetric-bend.expected.json', import.meta.url), 'utf8').trim();

describe('serialized street planning reservations', () => {
  it('preserves exact asymmetric bent queries and isolates generated output from inputs and later calls', () => {
    const original = structuredClone(input);
    const result = StreetCorridors.reservations(input.edges);
    for (const [index, edge] of input.edges.entries()) {
      expect(StreetCorridors.roadwayFor(edge)).toEqual(result.edges[index].roadway);
    }
    expect(JSON.stringify(result)).toBe(expected);
    expect(result.model).toBe(StreetCorridors.model);
    expect(Object.isFrozen(result.model)).toBe(true);
    expect(Object.isFrozen(result.model.bandOrder)).toBe(true);
    expect(Reflect.set(result.model, 'coordinateGrid', 1)).toBe(false);
    expect(Reflect.set(result.model.bandOrder, '0', 'walking')).toBe(false);
    expect(StreetCorridors.reservations(input.edges)).toEqual(result);
    result.edges[0].roadway[0][0][0] += 1;
    result.edges[0].sides.left.walking.length = 0;
    expect(JSON.stringify(StreetCorridors.reservations(input.edges))).toBe(expected);
    expect(input).toEqual(original);
  });

  it('preserves source order, unsectioned walking fallback and empty pedestrian or roadway regions', () => {
    const legacy: SectionedStreetEdge = { ...input.edges[0], id: 'legacy', crossSection: undefined };
    const alley: SectionedStreetEdge = { ...legacy, id: 'alley', class: 'alley', width: 0, sidewalk: { left: 2, right: 2 } };
    const highway: SectionedStreetEdge = { ...legacy, id: 'highway', class: 'highway', width: 24, sidewalk: { left: 0, right: 0 } };
    const edges = [legacy, alley, highway];
    const result = StreetCorridors.reservations(edges);
    for (const [index, edge] of edges.entries()) {
      expect(StreetCorridors.roadwayFor(edge)).toEqual(result.edges[index].roadway);
    }
    expect(result.edges.map((edge) => edge.edgeId)).toEqual(edges.map((edge) => edge.id));
    for (const side of ['left', 'right'] as const) expect(result.edges[0].sides[side].walking).toEqual(result.edges[0].sides[side].sidewalk);
    expect(result.edges[1].roadway).toEqual([]);
    expect(result.edges[2].sides).toEqual({ left: { sidewalk: [], walking: [] }, right: { sidewalk: [], walking: [] } });
    expect(result.edges[2].roadway).toEqual(new StreetCorridors([highway]).roadway.get(highway.id));
    expect(StreetCorridors.reservations([]).edges).toEqual([]);
  });

  it('keeps edge-local planning queries separate from final junction ground ownership', () => {
    const source = input.edges[0];
    const crossing: SectionedStreetEdge = { ...source, id: 'crossing', from: 'n2', to: 'n3', path: [[35, -20], [35, 40]] };
    const local = StreetCorridors.reservations([source]).edges[0];
    const network = StreetCorridors.reservations([source, crossing]);
    expect(network.edges[0]).toEqual(local);
    const shared = intersection(local.sides.left.walking, network.edges[1].roadway);
    expect(shared.reduce((sum, polygon) => sum + area(polygon), 0)).toBeGreaterThan(1);
    expect(network.model.authority).toBe('edge-local-planning');
  });
});
