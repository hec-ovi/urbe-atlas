import { expect, it } from 'vitest';
import { resolveStreetDesign } from '../Design';
import { StreetSections } from '../StreetSections';
import { StreetCorridors } from '../StreetCorridors';
import { difference, intersection, union } from '../../../geom/clip';
import type { Polygon } from '../../../../schema/blueprint';
import type { ExplicitSidePlanningReservation } from './schema';

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
  const input = structuredClone(edge);
  const result = StreetCorridors.reservations([edge]);
  expect(result.version).toBe('1.1.0');
  expect(result.model.version).toBe('1.1.0');
  const equalCover = (a: Polygon[], b: Polygon[]) => {
    expect(difference(a, b)).toEqual([]);
    expect(difference(b, a)).toEqual([]);
  };
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
  expect(edge).toEqual(input);
  expect(StreetCorridors.reservations([edge])).toEqual(result);
  expect(new StreetCorridors([edge]).roadway.get(edge.id)).toEqual(result.edges[0].roadway);
  const legacy = { ...edge, id: 'legacy', crossSection: undefined };
  const mixed = StreetCorridors.reservations([edge, legacy]);
  const side = mixed.edges[1].sides.left as ExplicitSidePlanningReservation;
  expect(side.bands['gutter-lip']).toEqual([]);
  expect(side.bands.gutter).toEqual([]);
  expect(side.walking).toEqual(side.sidewalk);
  expect(side.paved).toEqual(side.sidewalk);
});
