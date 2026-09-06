import { expect, it } from 'vitest';
import type { Polygon, StreetEdge, StreetNode, Vec2 } from '../schema/blueprint';
import type { JunctionGroundInput } from '../schema/junction-ground';
import { resolveStreetDesign } from '../src/streets/construction/Design';
import { StreetSections } from '../src/streets/construction/StreetSections';
import { StreetCorridors } from '../src/streets/construction/StreetCorridors';
import { GradeDatum } from '../src/streets/construction/datum';
import { CrossingPlanner } from '../src/streets/crossings/CrossingPlanner';
import { GroundCover } from '../src/streets/GroundCover';
import { JunctionGround } from '../src/streets/JunctionGround';
import { verifyPublishedCover } from '../src/geom/partition/published/verifyPublishedCover';
import { SourcePartition } from '../src/geom/partition/SourcePartition';
import { edgeMaskView } from '../src/geom/partition/EdgeMasks';
import { verifyPartition } from '../src/geom/partition/verifyPartition';

const box = (x0: number, y0: number, x1: number, y1: number): Polygon => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function fixture(paved = 4, transform: (point: Vec2) => Vec2 = point => point): JunctionGroundInput {
  const paths = [
    { id: 'west', class: 'road' as const, from: 'w', to: 'join', path: [[20, 50], [60, 50]] as Vec2[] },
    { id: 'east', class: 'road' as const, from: 'join', to: 'e', path: [[60, 50], [100, 50]] as Vec2[] },
    { id: 'north', class: 'street' as const, from: 'join', to: 'n', path: [[60, 50], [60, 100]] as Vec2[] },
  ];
  const nodes: StreetNode[] = [
    { id: 'w', position: [20, 50], edgeIds: ['west'], connections: [{ level: 0, edgeIds: ['west'] }] },
    { id: 'e', position: [100, 50], edgeIds: ['east'], connections: [{ level: 0, edgeIds: ['east'] }] },
    { id: 'n', position: [60, 100], edgeIds: ['north'], connections: [{ level: 0, edgeIds: ['north'] }] },
    { id: 'join', position: [60, 50], edgeIds: ['west', 'east', 'north'], connections: [{ level: 0, edgeIds: ['west', 'east', 'north'] }] },
  ];
  for (const path of paths) path.path = path.path.map(transform);
  for (const node of nodes) node.position = transform(node.position);
  const design = resolveStreetDesign({ ...resolveStreetDesign(), sidewalkProfiles: [{
    id: 'paved', curb: 0.2, border: 0, furnishing: 0, walking: paved, frontage: 0,
    edge: { curbRise: 0.2, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' } } },
  }] });
  const sections = StreetSections.plan(paths, nodes, design, () => 'residential');
  const edges: StreetEdge[] = sections.edges.map(edge => ({ ...edge, districtIds: [], level: 0,
    elevationProfile: [{ distance: 0, level: 0 }, { distance: Math.hypot(edge.path[1][0] - edge.path[0][0], edge.path[1][1] - edge.path[0][1]), level: 0 }] }));
  const datum = GradeDatum.plan({ boundary: box(0, 0, 120, 120).map(transform), edges, structures: [], roadwayTop: 0,
    pedestrianTop: 0.2, groundFormat: 'side-bands-v1' });
  const contact = CrossingPlanner.contacts({ nodes, edges, reservations: StreetCorridors.reservations(edges) })
    .domains.find(domain => domain.groups.some(group => group.nodeId === 'join'))!;
  return { edges, runs: sections.runs, contact, datum, bottom: -0.2, roadwayTop: 0, setback: 2, stationPitch: 1,
    remainder: { id: 'open', kind: 'land', landId: 'city', surface: 'open', bottom: -0.2, top: 0.2 } };
}

it('constructs distinct real T return roles and preserves 2, 4 and 6 metre straight paved spans', () => {
  for (const paved of [2, 4, 6]) {
    const input = fixture(paved);
    const original = JSON.stringify(input);
    const plan = JunctionGround.plan(input);
    const output = GroundCover.snapshot(plan);
    expect(JSON.stringify(input)).toBe(original);
    expect(() => verifyPublishedCover({ boundary: input.datum.boundary, exclusions: [],
      pieces: output.ground.map((owner, i) => ({ id: String(i), polygon: owner.polygon })) })).not.toThrow();
    expect(new Set(output.ground.map(owner => owner.surface))).toEqual(new Set(['roadway', 'gutter-lip', 'gutter', 'curb', 'sidewalk', 'open']));
    const owns = (role: string, polygon: Polygon) => plan.owners.some(owner => {
      const source = plan.sources.find(row => row.id === owner.sourceId)!;
      return 'role' in source && source.role === role && plan.partition.covers(owner.ownerId, polygon);
    });
    // The far north arm retains complete source widths and exact levels.
    expect(owns('walking', box(56 - paved, 80, 56, 81))).toBe(true);
    expect(owns('curb', box(56, 80, 56.2, 81))).toBe(true);
    expect(owns('gutter', box(56.2, 80, 56.48, 81))).toBe(true);
    expect(owns('gutter-lip', box(56.48, 80, 56.5, 81))).toBe(true);
    // Original upper-left corner (56.5,57) has a two-metre roadway bevel.
    const roadOwner = plan.owners.find(owner => plan.sources.some(source => source.id === owner.sourceId && source.kind === 'junction' && source.role === 'roadway'))!;
    expect(plan.partition.covers(roadOwner.ownerId, box(56, 57.1, 56.2, 57.3))).toBe(true);
    // Real constant-width faces along the bevel, away from the straight-arm claims.
    for (const [role, offset] of [['gutter-lip', 0.01], ['gutter', 0.16], ['curb', 0.4], ['walking', 1]] as const) {
      const center: Vec2 = [55.5 - offset / Math.SQRT2, 58 + offset / Math.SQRT2];
      const sample = box(center[0] - 0.002, center[1] - 0.002, center[0] + 0.002, center[1] + 0.002);
      expect(plan.owners.some(owner => plan.sources.some(source => source.id === owner.sourceId && source.kind === 'junction' && source.role === role)
        && plan.partition.covers(owner.ownerId, sample, { encoding: 'binary' })), role).toBe(true);
    }
    const joint = output.sources.filter(source => source.kind === 'junction');
    expect(joint.map(source => source.role)).toEqual(['roadway', 'gutter-lip', 'gutter', 'curb', 'border', 'furnishing', 'walking', 'frontage']);
    expect(joint.every(source => source.contactId === input.contact.id && source.contributors.length === 3)).toBe(true);
    for (const contributor of joint[0].contributors) {
      expect(contributor.runStation % input.stationPitch).toBe(0);
      const run = input.runs.find(row => row.id === contributor.runId)!;
      const record = run.edges.find(row => row.edgeId === contributor.edgeId)!;
      expect(contributor.runStation).toBe(record.forward ? record.start + contributor.distance : record.end - contributor.distance);
    }
    expect(output.ground.filter(owner => owner.surface === 'gutter').every(owner => owner.top === 0)).toBe(true);
    expect(output.ground.filter(owner => owner.surface === 'gutter-lip').every(owner => owner.top === 0.02)).toBe(true);
    expect(output.ground.filter(owner => owner.surface === 'curb').every(owner => owner.top === 0.2)).toBe(true);
  }
});

it('preserves exact output under source-record ordering and repeated calls', () => {
  const input = fixture();
  const expected = JunctionGround.build(input);
  expect(JunctionGround.build(input)).toEqual(expected);
  input.edges.reverse(); input.runs.reverse(); input.contact.arms.reverse();
  input.datum.grade.roadway.reverse(); input.datum.grade.sideBands!.reverse(); input.datum.spans.reverse();
  expect(JSON.stringify(JunctionGround.build(input))).toBe(JSON.stringify(expected));
});

it('keeps run phase and gutter ownership after a quarter turn and a fractional-grid translation', () => {
  const transform = ([x, z]: Vec2): Vec2 => [120 - z + 0.123, x + 0.321];
  const input = fixture(4, transform);
  const plan = JunctionGround.plan(input);
  const output = GroundCover.snapshot(plan);
  const sample = box(56.21, 80.1, 56.47, 80.9).map(transform);
  expect(plan.owners.some(owner => owner.surface === 'gutter' && plan.partition.covers(owner.ownerId, sample, { encoding: 'binary' }))).toBe(true);
  for (const source of output.sources) if (source.kind === 'junction') {
    expect(source.contributors.every(row => row.runStation % input.stationPitch === 0)).toBe(true);
  }
  expect(() => verifyPublishedCover({ boundary: input.datum.boundary, exclusions: [],
    pieces: output.ground.map((owner, i) => ({ id: String(i), polygon: owner.polygon })) })).not.toThrow();
});

it('rejects unsupported topology, conflicting heights, missing source roles and insufficient return land', () => {
  const input = fixture();
  for (const mutate of [
    (value: JunctionGroundInput) => { value.contact.arms.pop(); },
    (value: JunctionGroundInput) => { value.datum.grade.sideBands![0].top += 0.1; },
    (value: JunctionGroundInput) => { value.datum.grade.sideBands!.pop(); },
    (value: JunctionGroundInput) => { value.datum.boundary = box(59, 49, 61, 51); },
    (value: JunctionGroundInput) => { value.setback = 50; },
    (value: JunctionGroundInput) => { value.remainder.id = `junction:${value.contact.id}:roadway`; },
  ]) {
    const changed = structuredClone(input); mutate(changed);
    expect(() => JunctionGround.build(changed)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  }
});

it('validates geometry-free junction provenance at the public ground snapshot boundary', () => {
  const input = fixture();
  const plan = JunctionGround.plan(input);
  const source = plan.sources.find(row => row.kind === 'junction')!;
  if (source.kind !== 'junction') throw Error('Missing junction source');
  source.contributors[0].spanIds = [];
  expect(() => GroundCover.snapshot(plan)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
});

it('hands every exact return role to disjoint original-arm fitting fields with shared transition supports', () => {
  for (const paved of [2, 4, 6]) {
    const input = fixture(paved), before = JSON.stringify(input);
    const fitting = JunctionGround.fitting(input), plan = JunctionGround.plan(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(fitting.fields).toHaveLength(6);
    expect(new Set(fitting.fields.map(field => field.id)).size).toBe(6);
    expect(fitting.transitions).toHaveLength(2);
    for (const [index, field] of fitting.fields.entries()) {
      const polygon = edgeMaskView({ mask: field.mask, encoding: fitting.encoding });
      for (const other of fitting.fields.slice(index + 1)) {
        const partition = SourcePartition.create({ id: 'field', source: polygon, coordinateScale: 1000 });
        partition.divide('field', { claims: [{ id: 'overlap', masks: [], edgeMasks: [other.mask], encoding: fitting.encoding }], remainderId: 'rest' });
        expect(partition.boundaries('overlap')).toEqual([]);
      }
      const source = plan.sources.find(source => source.kind === 'junction' && source.role === 'curb')!;
      expect(source.kind).toBe('junction');
      if (source.kind !== 'junction') throw Error('Missing return source');
      const contributor = source.contributors.find(row => row.edgeId === field.edgeId)!;
      expect(field.handoff).toEqual({ distance: contributor.distance, runStation: contributor.runStation });
      expect(field.sourceIds.every(id => plan.sources.some(source => source.id === id && source.kind === 'junction'))).toBe(true);
      const edge = input.edges.find(edge => edge.id === field.edgeId)!;
      const distance = Math.hypot(edge.path[1][0] - edge.path[0][0], edge.path[1][1] - edge.path[0][1]);
      for (const axis of [0, 1]) expect(field.frame.origin[axis] + field.frame.u[axis] * field.handoff.runStation)
        .toBeCloseTo(edge.path[0][axis] + (edge.path[1][axis] - edge.path[0][axis]) * field.handoff.distance / distance, 10);
    }
    for (const transition of fitting.transitions) {
      expect(transition.fieldIds.every(id => fitting.fields.find(field => field.id === id)!.transitionIds.includes(transition.id))).toBe(true);
      for (const id of transition.fieldIds) {
        const field = fitting.fields.find(field => field.id === id)!;
        const polygon = edgeMaskView({ mask: field.mask, encoding: fitting.encoding });
        expect(polygon).toContainEqual(transition.from);
        expect(polygon).toContainEqual(transition.to);
      }
    }
    for (const owner of plan.owners.filter(owner => fitting.fields[0].sourceIds.includes(owner.sourceId))) {
      const remainderId = `${owner.ownerId}:unfitted`;
      plan.partition.divide(owner.ownerId, { claims: fitting.fields.map(field => ({
        id: `${owner.ownerId}:${field.id}`, masks: [], edgeMasks: [field.mask], encoding: fitting.encoding,
      })), remainderId });
      expect(plan.partition.boundaries(remainderId)).toEqual([]);
    }
    expect(() => verifyPartition({ source: plan.boundary, coordinateScale: 1000, partition: plan.partition.finish() })).not.toThrow();
    input.edges.reverse(); input.runs.reverse(); input.contact.arms.reverse();
    expect(JunctionGround.fitting(input)).toEqual(fitting);
  }
});

it('keeps fitting masks and corner transitions on shared authored axes after a quarter turn', () => {
  const transform = ([x, z]: Vec2): Vec2 => [120 - z + 0.123, x + 0.321];
  const fitting = JunctionGround.fitting(fixture(4, transform));
  for (const field of fitting.fields) {
    expect(Math.abs(field.frame.u[0]) + Math.abs(field.frame.u[1])).toBe(1);
    for (const vertex of field.mask) for (const coordinate of vertex.from) expect(coordinate).toBe(Math.round(coordinate * 1000) / 1000);
  }
  const input = fixture();
  input.runs.find(run => run.edges.length === 2)!.edges[0].forward = !input.runs.find(run => run.edges.length === 2)!.edges[0].forward;
  expect(() => JunctionGround.fitting(input)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
});
