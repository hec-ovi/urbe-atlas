import { expect, it } from 'vitest';
import type { Polygon, StreetEdge, Vec2 } from '../schema/blueprint';
import type { GroundSource, GroundSourceClaim, SourceGroundCoverInput } from '../schema/ground';
import { verifyPublishedCover } from '../src/geom/partition/published/verifyPublishedCover';
import { resolveStreetDesign } from '../src/streets/construction/Design';
import { StreetSections } from '../src/streets/construction/StreetSections';
import { GradeDatum } from '../src/streets/construction/datum';
import { GroundCover } from '../src/streets/GroundCover';

const rectangle = (x0: number, z0: number, x1: number, z1: number): Polygon =>
  [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

function straightClaims(): SourceGroundCoverInput {
  const sources = [30, 80].map((z, index) => ({
    id: `street-${index}`, class: index ? 'road' as const : 'street' as const,
    from: `a${index}`, to: `b${index}`, path: [[20, z], [80, z]] as Vec2[],
  }));
  const nodes = sources.flatMap(edge => edge.path.map((position, index) => ({
    id: index ? edge.to : edge.from, position, edgeIds: [edge.id],
  })));
  const design = resolveStreetDesign({
    ...resolveStreetDesign(),
    sidewalkProfiles: [2, 4].map(paved => ({
      id: `paved-${paved}`, curb: 0.2, border: 0, furnishing: 0.5, walking: paved - 0.5, frontage: 0,
      edge: { curbRise: paved === 2 ? 0.2 : 0.3,
        gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' as const } } },
    })),
    sidewalkAssignments: [
      { district: 'residential', street: 'paved-2', road: 'paved-2' },
      { district: 'commercial', street: 'paved-4', road: 'paved-4' },
    ],
  });
  const edges: StreetEdge[] = StreetSections.plan(sources, nodes, design,
    point => point[1] < 60 ? 'residential' : 'commercial').edges.map(edge => ({
    ...edge, districtIds: [], level: 5,
    elevationProfile: [{ distance: 0, level: 5 }, { distance: 60, level: 5 }],
  }));
  const datum = GradeDatum.plan({
    groundFormat: 'side-bands-v1', boundary: rectangle(0, 0, 120, 120), edges,
    structures: [], roadwayTop: 5, pedestrianTop: 5.15,
  });
  const claims: GroundSourceClaim[] = [
    ...datum.grade.roadway.map(row => ({
      source: { id: `road:${row.spanId}`, kind: 'roadway' as const,
        edgeId: datum.spans.find(span => span.id === row.spanId)!.edgeId,
        spanIds: [row.spanId], surface: 'roadway' as const, bottom: 4.8, top: 5 },
      masks: row.polygons,
    })),
    ...datum.grade.sideBands!.map(row => ({
      source: { id: `${row.edgeId}:${row.side}:${row.role}`, kind: 'side-band' as const,
        edgeId: row.edgeId, spanIds: row.spanIds, side: row.side, role: row.role,
        surface: row.role === 'gutter' || row.role === 'gutter-lip' || row.role === 'curb' ? row.role : 'sidewalk' as const,
        bottom: 4.8, top: row.top },
      masks: row.masks,
    })),
  ];
  return {
    format: 'source-claims-v1', boundary: datum.boundary, excluded: [rectangle(0, 0, 5, 5)], claims,
    remainder: { id: 'open-land', kind: 'land', landId: 'city', surface: 'open', bottom: 4.8, top: 5.1 },
  };
}

it('preserves complete straight source widths, IDs and unequal absolute levels', () => {
  const input = straightClaims();
  const saved = JSON.stringify(input);
  const plan = GroundCover.plan(input);
  const snapshot = GroundCover.snapshot(plan);
  expect(snapshot.format).toBe('source-claims-v1');
  expect(GroundCover.build(input)).toEqual(snapshot);
  expect(JSON.stringify(input)).toBe(saved);
  for (const claim of input.claims) {
    const owner = plan.owners.find(row => row.sourceId === claim.source.id)!;
    expect(snapshot.sources.find(source => source.id === claim.source.id)).toEqual(claim.source);
    for (const mask of claim.masks) expect(plan.partition.covers(owner.ownerId, mask)).toBe(true);
  }
  expect(snapshot.sources.find(source => source.id === 'street-0:left:walking')!.top).toBe(5.2);
  expect(snapshot.sources.find(source => source.id === 'street-1:left:walking')!.top).toBe(5.3);
  expect(new Set(snapshot.ground.map(owner => owner.surface)))
    .toEqual(new Set(['roadway', 'gutter-lip', 'gutter', 'curb', 'sidewalk', 'open']));
  expect(snapshot.ground.every(owner => {
    const source = snapshot.sources.find(item => item.id === owner.sourceId)!;
    return owner.bottom === source.bottom && owner.top === source.top && owner.surface === source.surface;
  })).toBe(true);
  expect(snapshot.sources.every(source => !('masks' in source) && !('polygon' in source))).toBe(true);
  expect(() => verifyPublishedCover({ boundary: input.boundary, exclusions: input.excluded,
    pieces: snapshot.ground.map((owner, index) => ({ id: String(index), polygon: owner.polygon })),
  })).not.toThrow();
});

it('rejects unresolved same-role overlap regardless of input order or equal heights', () => {
  const input = straightClaims();
  const first = input.claims.find(claim => claim.source.id === 'street-0:left:walking')!;
  const second: GroundSourceClaim = { source: { ...first.source, id: 'another-walking-source' }, masks: first.masks };
  for (const claims of [[first, second], [second, first]]) {
    expect(() => GroundCover.plan({ ...input, claims })).toThrowError(expect.objectContaining({
      code: 'E_INVARIANT', message: 'ground source claims overlap',
      details: expect.objectContaining({ sourceId: claims[1].source.id, conflictingSourceIds: [claims[0].source.id] }),
    }));
  }
});

it('retains one exact partition through later source-owned subdivision', () => {
  const input = straightClaims();
  const claim = input.claims.find(row => row.source.id === 'street-0:left:walking')!;
  const plan = GroundCover.plan({ ...input, claims: [] });
  const retained = plan.partition;
  const originalOwner = plan.owners[0];
  plan.partition.divide(originalOwner.ownerId, {
    claims: [{ id: 'walking-child', masks: claim.masks }], remainderId: 'open-child',
  });
  plan.sources.push(claim.source);
  plan.owners.push(
    { ...originalOwner, ownerId: 'open-child' },
    { ownerId: 'walking-child', sourceId: claim.source.id, surface: claim.source.surface,
      bottom: claim.source.bottom, top: claim.source.top },
  );
  const snapshot = GroundCover.snapshot(plan);
  expect(plan.partition).toBe(retained);
  expect(snapshot.sources.find(source => source.id === claim.source.id)).toEqual(claim.source);
  expect(snapshot.ground.some(owner => owner.sourceId === claim.source.id)).toBe(true);
  for (const mask of claim.masks) expect(plan.partition.covers('walking-child', mask)).toBe(true);
  expect(() => verifyPublishedCover({ boundary: input.boundary, exclusions: input.excluded,
    pieces: snapshot.ground.map((owner, index) => ({ id: String(index), polygon: owner.polygon })),
  })).not.toThrow();
});

it('rejects invalid source claims and inconsistent snapshot metadata', () => {
  const input = straightClaims();
  const first = input.claims[0];
  expect(() => GroundCover.plan({ ...input, format: 'future' as never }))
    .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  expect(() => GroundCover.plan({ ...input, claims: null as never }))
    .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  expect(() => GroundCover.plan({ ...input, claims: [first, first] }))
    .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  expect(() => GroundCover.plan({ ...input, claims: [{ ...first, masks: [rectangle(-1, 10, 5, 20)] }] }))
    .toThrowError(expect.objectContaining({ code: 'E_INVARIANT', message: 'ground source claim leaves available land' }));
  expect(() => GroundCover.plan({ ...input, claims: [{ ...first, masks: [rectangle(1, 1, 4, 4)] }] }))
    .toThrowError(expect.objectContaining({ code: 'E_INVARIANT', message: 'ground source claim leaves available land' }));
  expect(() => GroundCover.plan({ ...input, claims: [{ ...first, source: { ...first.source, top: NaN } }] }))
    .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  expect(() => GroundCover.plan({ ...input, claims: [{ ...first,
    source: { ...first.source, surface: 'gutter' } as GroundSource }] }))
    .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  const plan = GroundCover.plan({ ...input, claims: [first] });
  const owner = plan.owners.find(row => row.sourceId === first.source.id)!;
  owner.top += 1;
  expect(() => GroundCover.snapshot(plan)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  owner.top -= 1;
  plan.sources = plan.sources.filter(source => source.id !== first.source.id);
  expect(() => GroundCover.snapshot(plan)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
});

it('unions one source mask list while preserving contact-only source boundaries', () => {
  const source = (id: string): GroundSource => ({
    id, kind: 'land', landId: id, surface: 'sidewalk', bottom: 2, top: 2.2,
  });
  const input: SourceGroundCoverInput = {
    format: 'source-claims-v1', boundary: rectangle(0, 0, 10, 10), excluded: [],
    claims: [
      { source: source('first'), masks: [rectangle(0, 0, 4, 10), rectangle(2, 0, 6, 10)] },
      { source: source('second'), masks: [rectangle(6, 0, 8, 10)] },
    ],
    remainder: { id: 'remainder', kind: 'land', landId: 'remainder', surface: 'open', bottom: 2, top: 2.1 },
  };
  const plan = GroundCover.plan(input);
  const first = plan.owners.find(owner => owner.sourceId === 'first')!;
  const second = plan.owners.find(owner => owner.sourceId === 'second')!;
  expect(plan.partition.covers(first.ownerId, rectangle(0, 0, 6, 10))).toBe(true);
  expect(plan.partition.covers(second.ownerId, rectangle(6, 0, 8, 10))).toBe(true);
  const reordered = GroundCover.build({ ...input, claims: [...input.claims].reverse() });
  expect(new Set(reordered.ground.map(owner => owner.sourceId))).toEqual(new Set(['first', 'second', 'remainder']));
  expect(() => verifyPublishedCover({ boundary: input.boundary, exclusions: [],
    pieces: reordered.ground.map((owner, index) => ({ id: String(index), polygon: owner.polygon })),
  })).not.toThrow();
});
