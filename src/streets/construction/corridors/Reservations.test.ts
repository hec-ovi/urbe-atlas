import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { StreetCorridors } from '../StreetCorridors';
import { resolveStreetDesign } from '../Design';
import { StreetSections } from '../StreetSections';
import { difference, intersection, union } from '../../../geom/clip';
import { area } from '../../../geom/polygon';
import type { Polygon } from '../../../../schema/blueprint';
import type { SectionedStreetEdge } from '../schema/sections';
import type { ExplicitSidePlanningReservation } from './schema';

const input = JSON.parse(readFileSync(new URL('./fixtures/asymmetric-bend.input.json', import.meta.url), 'utf8')) as { edges: SectionedStreetEdge[] };
const expected = readFileSync(new URL('./fixtures/asymmetric-bend.expected.json', import.meta.url), 'utf8').trim();

const equalCover = (a: Polygon[], b: Polygon[]) => {
  expect(difference(a, b)).toEqual([]);
  expect(difference(b, a)).toEqual([]);
};

describe('serialized street planning reservations', () => {
  it('preserves the exact bent fixture, source order and empty regions without leaving the edge', () => {
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

    const legacy: SectionedStreetEdge = { ...input.edges[0], id: 'legacy', crossSection: undefined };
    const alley: SectionedStreetEdge = { ...legacy, id: 'alley', class: 'alley', width: 0, sidewalk: { left: 2, right: 2 } };
    const highway: SectionedStreetEdge = { ...legacy, id: 'highway', class: 'highway', width: 24, sidewalk: { left: 0, right: 0 } };
    const edges = [legacy, alley, highway];
    const plain = StreetCorridors.reservations(edges);
    for (const [index, edge] of edges.entries()) {
      expect(StreetCorridors.roadwayFor(edge)).toEqual(plain.edges[index].roadway);
    }
    expect(plain.edges.map((edge) => edge.edgeId)).toEqual(edges.map((edge) => edge.id));
    for (const side of ['left', 'right'] as const) expect(plain.edges[0].sides[side].walking).toEqual(plain.edges[0].sides[side].sidewalk);
    expect(plain.edges[1].roadway).toEqual([]);
    expect(plain.edges[2].sides).toEqual({ left: { sidewalk: [], walking: [] }, right: { sidewalk: [], walking: [] } });
    expect(plain.edges[2].roadway).toEqual(new StreetCorridors([highway]).roadway.get(highway.id));
    expect(StreetCorridors.reservations([]).edges).toEqual([]);

    const source = input.edges[0];
    const crossing: SectionedStreetEdge = { ...source, id: 'crossing', from: 'n2', to: 'n3', path: [[35, -20], [35, 40]] };
    const local = StreetCorridors.reservations([source]).edges[0];
    const network = StreetCorridors.reservations([source, crossing]);
    expect(network.edges[0]).toEqual(local);
    const shared = intersection(local.sides.left.walking, network.edges[1].roadway);
    expect(shared.reduce((sum, polygon) => sum + area(polygon), 0)).toBeGreaterThan(1);
    expect(network.model.authority).toBe('edge-local-planning');
  });

  it('partitions asymmetric bent sides into exact role reservations and preserves reversed direction', () => {
    const design = resolveStreetDesign();
    design.sidewalkProfiles = [2, 6].map((paved) => ({ id: `p${paved}`, curb: 0.2,
      border: paved === 2 ? 0 : 0.2, furnishing: paved === 2 ? 0 : 1,
      walking: paved === 2 ? 2 : 4, frontage: paved === 2 ? 0 : 0.8,
      edge: { curbRise: 0.2, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' as const } } },
    }));
    design.sidewalkAssignments = [{ district: 'residential', street: 'p2' }, { district: 'commercial', street: 'p6' }];
    const output = StreetSections.plan([
      { id: 'e', class: 'street', from: 'a', to: 'b', path: [[0, 0], [50, 0], [80, 20], [100, 20]] },
    ], [{ id: 'a', position: [0, 0], edgeIds: ['e'] }, { id: 'b', position: [100, 20], edgeIds: ['e'] }],
    resolveStreetDesign(design), ([x, z]) => z > (x - 50) * 2 / 3 ? 'residential' : 'commercial');
    const edge = output.edges[0];
    expect(edge.sidewalk).toEqual({ left: 2.5, right: 6.5 });
    const authored = structuredClone(edge);
    const result = StreetCorridors.reservations([edge]);
    expect(result.version).toBe('2.1.0');
    expect(result.model.version).toBe('2.1.0');
    for (const side of ['left', 'right'] as const) {
      const record = result.edges[0].sides[side] as ExplicitSidePlanningReservation;
      const roles = [record.walking, ...Object.values(record.bands)];
      equalCover(union(roles.flat()), record.sidewalk);
      for (let i = 0; i < roles.length; i++) for (let j = i + 1; j < roles.length; j++) expect(intersection(roles[i], roles[j])).toEqual([]);
      equalCover(record.paved, union([record.walking, record.bands.border, record.bands.furnishing, record.bands.frontage].flat()));
      for (const role of ['gutter', 'gutter-lip', 'curb'] as const) expect(intersection(record.paved, record.bands[role])).toEqual([]);
      const reversed = { ...edge, from: edge.to, to: edge.from, path: [...edge.path].reverse(),
        sidewalk: { left: edge.sidewalk.right, right: edge.sidewalk.left },
        crossSection: { ...edge.crossSection!, sidewalks: { left: edge.crossSection!.sidewalks.right, right: edge.crossSection!.sidewalks.left } },
      };
      const other = side === 'left' ? 'right' : 'left';
      equalCover(StreetCorridors.sidewalk(reversed, other), record.sidewalk);
      for (const role of ['gutter-lip', 'gutter', 'curb', 'walking'] as const) equalCover(StreetCorridors.band(reversed, other, role), role === 'walking' ? record.walking : record.bands[role]);
    }
    expect(edge).toEqual(authored);
    expect(new StreetCorridors([edge]).roadway.get(edge.id)).toEqual(result.edges[0].roadway);
    const legacy = { ...edge, id: 'legacy', crossSection: undefined };
    const mixed = StreetCorridors.reservations([edge, legacy]);
    const side = mixed.edges[1].sides.left as ExplicitSidePlanningReservation;
    expect(side.bands['gutter-lip']).toEqual([]);
    expect(side.bands.gutter).toEqual([]);
    expect(side.walking).toEqual(side.sidewalk);
    expect(side.paved).toEqual(side.sidewalk);
  });
});
