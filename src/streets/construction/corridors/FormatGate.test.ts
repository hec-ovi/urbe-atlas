import { expect, it } from 'vitest';
import { resolveStreetDesign } from '../Design';
import { StreetSections } from '../StreetSections';
import { StreetCorridors } from '../StreetCorridors';

it('rejects unsupported explicit-side reservations while retaining independent roadway queries', () => {
  const design = resolveStreetDesign();
  design.sidewalkProfiles = [{ id: 'p', curb: 0.2, border: 0, furnishing: 0, walking: 2, frontage: 0,
    edge: { curbRise: 0.2, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' } } },
  }];
  const output = StreetSections.plan([
    { id: 'e', class: 'street', from: 'a', to: 'b', path: [[0, 0], [100, 0]] },
  ], [{ id: 'a', position: [0, 0], edgeIds: ['e'] }, { id: 'b', position: [100, 0], edgeIds: ['e'] }],
  resolveStreetDesign(design), () => 'residential');
  for (const call of [
    () => new StreetCorridors(output.edges),
    () => StreetCorridors.reservations(output.edges),
    () => StreetCorridors.sidewalk(output.edges[0], 'left'),
    () => StreetCorridors.band(output.edges[0], 'right', 'walking'),
  ]) expect(call).toThrowError(expect.objectContaining({ code: 'E_INVARIANT', message: expect.stringContaining('explicit sidewalk geometry requires corridor migration') }));
  expect(StreetCorridors.roadwayFor(output.edges[0]).length).toBeGreaterThan(0);
});
