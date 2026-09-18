/** Ground construction entries: legacy cover, source claims, junction returns and their fitting fields. */
import { describe, expect, it } from 'vitest';
import type { Polygon, Polyline, StreetEdge, StreetNode, Vec2 } from '../schema/blueprint';
import type { GroundSource, GroundSourceClaim, SourceGroundCoverInput } from '../schema/ground';
import type { JunctionGroundInput } from '../schema/junction-ground';
import { difference, intersection } from '../src/geom/clip';
import { edgeMaskView } from '../src/geom/partition/EdgeMasks';
import { SourcePartition } from '../src/geom/partition/SourcePartition';
import { verifyPartition } from '../src/geom/partition/verifyPartition';
import { verifyPublishedCover } from '../src/geom/partition/published/verifyPublishedCover';
import { coversSegment } from '../src/geom/polygon';
import { CityGround } from '../src/CityGround';
import { GroundCover, type GroundCoverInput } from '../src/streets/GroundCover';
import { JunctionGround } from '../src/streets/JunctionGround';
import { GradeDatum } from '../src/streets/construction/datum';
import { resolveStreetDesign } from '../src/streets/construction/Design';
import { StreetSections } from '../src/streets/construction/StreetSections';
import { StreetCorridors } from '../src/streets/construction/StreetCorridors';
import { CrossingPlanner } from '../src/streets/crossings/CrossingPlanner';
import { ModuleGround } from '../src/streets/construction/modules/ModuleGround';
import { StreetModuleKit } from '../src/streets/construction/modules/StreetModuleKit';

const rectangle = (x0: number, z0: number, x1: number, z1: number): Polygon => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const invariant = expect.objectContaining({ code: 'E_INVARIANT' });
const pieces = (polygons: Polygon[]) => polygons.map((polygon, index) => ({ id: String(index), polygon }));

describe('legacy ground cover', () => {
  it('assigns every surface once, retains authored collinearity and refines a retained owner', () => {
    const boundary: Polygon = [[190, 433], [192, 433], [192, 435], [190, 435]];
    const source: Polygon = [[190.788, 433.93], [190.72, 433.846], [191, 433]];
    const subdivided: Polygon = [source[0], [190.754, 433.888], ...source.slice(1)];
    const collinear = { boundary, water: [], stationBays: [],
      masks: { roadway: [], curb: [], sidewalk: [subdivided], block: [source], open: [] } };
    const original = JSON.stringify(collinear);
    const ground = GroundCover.build(collinear);
    expect(new Set(ground.map((region) => region.surface))).toEqual(new Set(['sidewalk', 'open']));
    expect(ground.filter((region) => region.surface === 'sidewalk')).toHaveLength(1);
    expect(JSON.stringify(collinear)).toBe(original);

    const band = (left: number, right: number): Polygon => [[left, 0], [right, 0], [right, 10], [left, 10]];
    const input: GroundCoverInput = { boundary: band(0, 10), water: [band(0, 2)], stationBays: [band(2, 3)], masks: {
      roadway: [band(3, 4)], curb: [band(4, 5)], sidewalk: [band(5, 6)], block: [band(6, 7)], open: [band(7, 8)],
    } };
    const plan = GroundCover.plan(input);
    const snapshot = GroundCover.snapshot(plan);
    expect(GroundCover.build(input)).toEqual(snapshot);
    expect(plan.owners.map((owner) => owner.ownerId)).toEqual(['station', 'roadway', 'curb', 'sidewalk', 'block', 'open', 'fringe']);
    expect(plan.excludedOwnerIds).toEqual(['water']);
    expect(plan.partition.covers('sidewalk', band(5, 6))).toBe(true);
    // a later stage can divide a retained owner, but only after registering the new owner
    plan.partition.divide('sidewalk', { claims: [{ id: 'slab', masks: [band(5, 6)] }], remainderId: 'remaining' });
    expect(() => GroundCover.snapshot(plan)).toThrowError(invariant);
    const refined = { ...plan, owners: [...plan.owners, { ...plan.owners.find((owner) => owner.ownerId === 'sidewalk')!, ownerId: 'slab' }] };
    expect(GroundCover.snapshot(refined)).toEqual(snapshot);

    // station bay land gets one owner across module sidewalk, open land and building land
    {
      const kit = new StreetModuleKit();
      const block = kit.block({ id: 'b0', origin: [0, 0], panels: [40, 40], sidewalks: [4, 4, 4, 4], finish: 'maintained' });
      const modules = ModuleGround.cover(kit.construction());
      const boundary = rectangle(-4, -4, 44, 44), water = [rectangle(-4, -4, 0, -1)];
      const stationBays = [rectangle(10, 2, 20, 14), rectangle(18, 2, 24, 8)];
      const input = { boundary, water, roadway: [rectangle(-4, -4, 44, -0.5)], blockBounds: [block.outer], modules,
        lots: [rectangle(4, 12, 36, 36)], open: [rectangle(4, 4, 36, 12)], stationBays };

      const ground = CityGround.build(input);
      expect(ground.slice(0, modules.length)).toEqual(modules.map(({ blockId, ...region }) => ({ ...region, moduleBlockId: blockId })));
      expect(CityGround.build(input)).toEqual(ground);
      const polygons = ground.map((region) => region.polygon);
      expect(difference([boundary], [...water, ...polygons])).toEqual([]);
      expect(difference(polygons, [boundary])).toEqual([]);
      expect(intersection(polygons, water)).toEqual([]);
      for (let i = 0; i < ground.length; i++) {
        for (let j = i + 1; j < ground.length; j++) {
          expect(intersection([ground[i].polygon], [ground[j].polygon]), `ground ${i}/${j}`).toEqual([]);
        }
      }
      const sidewalk = ground.filter((region) => region.surface === 'sidewalk');
      expect(difference(stationBays, sidewalk.map((region) => region.polygon))).toEqual([]);
      expect(sidewalk.every((region) => region.top === 0.2)).toBe(true);
      expect(intersection(ground.filter((region) => region.surface === 'block' || region.surface === 'open')
        .map((region) => region.polygon), stationBays)).toEqual([]);
    }
  });

  it('publishes an independently verifiable cover that keeps its lane edge and shared seam', () => {
    const input = e103Input();
    const plan = GroundCover.plan(input);
    expect(plan.partition.covers('roadway', [[859.028, 355.998], [920.281, 355.49], [920.397, 369.49], [859.144, 369.998]])).toBe(true);
    const ground = GroundCover.snapshot(plan);
    const witness: Vec2 = [886.731, 369.7686];
    expect(ground.filter((region) => region.surface === 'roadway')
      .some((region) => coversSegment(region.polygon, witness, witness))).toBe(true);
    const seam: Vec2 = [886.731, 355.7676];
    expect(ground.filter((region) => coversSegment(region.polygon, seam, seam)).map((region) => region.surface)).toEqual(['sidewalk']);
    expect(() => verifyPublishedCover({ boundary: input.boundary, exclusions: [],
      pieces: pieces(ground.map((region) => region.polygon)) })).not.toThrow();
  });
});

describe('source-owned ground claims', () => {
  it('preserves complete source widths, IDs and unequal absolute levels', () => {
    const input = straightClaims();
    const saved = JSON.stringify(input);
    const plan = GroundCover.plan(input);
    const snapshot = GroundCover.snapshot(plan);
    expect(snapshot.format).toBe('source-claims-v1');
    expect(GroundCover.build(input)).toEqual(snapshot);
    expect(JSON.stringify(input)).toBe(saved);
    for (const claim of input.claims) {
      const owner = plan.owners.find((row) => row.sourceId === claim.source.id)!;
      expect(snapshot.sources.find((source) => source.id === claim.source.id)).toEqual(claim.source);
      for (const mask of claim.masks) expect(plan.partition.covers(owner.ownerId, mask)).toBe(true);
    }
    expect(snapshot.sources.find((source) => source.id === 'street-0:left:walking')!.top).toBe(5.2);
    expect(snapshot.sources.find((source) => source.id === 'street-1:left:walking')!.top).toBe(5.3);
    expect(new Set(snapshot.ground.map((owner) => owner.surface)))
      .toEqual(new Set(['roadway', 'gutter-lip', 'gutter', 'curb', 'sidewalk', 'open']));
    expect(snapshot.ground.every((owner) => {
      const source = snapshot.sources.find((item) => item.id === owner.sourceId)!;
      return owner.bottom === source.bottom && owner.top === source.top && owner.surface === source.surface;
    })).toBe(true);
    expect(snapshot.sources.every((source) => !('masks' in source) && !('polygon' in source))).toBe(true);
    expect(() => verifyPublishedCover({ boundary: input.boundary, exclusions: input.excluded,
      pieces: pieces(snapshot.ground.map((owner) => owner.polygon)) })).not.toThrow();
  });

  it('unions one source mask list, rejects a distinct overlap and retains the partition for later subdivision', () => {
    const land = (id: string): GroundSource => ({ id, kind: 'land', landId: id, surface: 'sidewalk', bottom: 2, top: 2.2 });
    const contact: SourceGroundCoverInput = {
      format: 'source-claims-v1', boundary: rectangle(0, 0, 10, 10), excluded: [],
      claims: [
        { source: land('first'), masks: [rectangle(0, 0, 4, 10), rectangle(2, 0, 6, 10)] },
        { source: land('second'), masks: [rectangle(6, 0, 8, 10)] },
      ],
      remainder: { id: 'remainder', kind: 'land', landId: 'remainder', surface: 'open', bottom: 2, top: 2.1 },
    };
    const united = GroundCover.plan(contact);
    expect(united.partition.covers(united.owners.find((owner) => owner.sourceId === 'first')!.ownerId, rectangle(0, 0, 6, 10))).toBe(true);
    const reordered = GroundCover.build({ ...contact, claims: [...contact.claims].reverse() });
    expect(new Set(reordered.ground.map((owner) => owner.sourceId))).toEqual(new Set(['first', 'second', 'remainder']));

    // two distinct sources cannot resolve an overlap by order, even with equal roles and heights
    const input = straightClaims();
    const first = input.claims.find((claim) => claim.source.id === 'street-0:left:walking')!;
    const second: GroundSourceClaim = { source: { ...first.source, id: 'another-walking-source' }, masks: first.masks };
    for (const claims of [[first, second], [second, first]]) {
      expect(() => GroundCover.plan({ ...input, claims })).toThrowError(expect.objectContaining({
        code: 'E_INVARIANT', message: 'ground source claims overlap',
        details: expect.objectContaining({ sourceId: claims[1].source.id, conflictingSourceIds: [claims[0].source.id] }),
      }));
    }

    // an empty claim list establishes the land partition that a later stage divides
    const plan = GroundCover.plan({ ...input, claims: [] });
    const retained = plan.partition;
    const originalOwner = plan.owners[0];
    plan.partition.divide(originalOwner.ownerId, { claims: [{ id: 'walking-child', masks: first.masks }], remainderId: 'open-child' });
    plan.sources.push(first.source);
    plan.owners.push({ ...originalOwner, ownerId: 'open-child' },
      { ownerId: 'walking-child', sourceId: first.source.id, surface: first.source.surface,
        bottom: first.source.bottom, top: first.source.top });
    const snapshot = GroundCover.snapshot(plan);
    expect(plan.partition).toBe(retained);
    expect(snapshot.ground.some((owner) => owner.sourceId === first.source.id)).toBe(true);
    for (const mask of first.masks) expect(plan.partition.covers('walking-child', mask)).toBe(true);
    expect(() => verifyPublishedCover({ boundary: input.boundary, exclusions: input.excluded,
      pieces: pieces(snapshot.ground.map((owner) => owner.polygon)) })).not.toThrow();
  });
});

describe('junction returns', () => {
  it('constructs distinct T return roles and preserves 2, 4 and 6 metre straight paved spans', () => {
    for (const paved of [2, 4, 6]) {
      const input = junctionFixture(paved);
      const original = JSON.stringify(input);
      const plan = JunctionGround.plan(input);
      const output = GroundCover.snapshot(plan);
      expect(JSON.stringify(input)).toBe(original);
      expect(() => verifyPublishedCover({ boundary: input.datum.boundary, exclusions: [],
        pieces: pieces(output.ground.map((owner) => owner.polygon)) })).not.toThrow();
      expect(new Set(output.ground.map((owner) => owner.surface)))
        .toEqual(new Set(['roadway', 'gutter-lip', 'gutter', 'curb', 'sidewalk', 'open']));
      const owns = (role: string, polygon: Polygon) => plan.owners.some((owner) => {
        const source = plan.sources.find((row) => row.id === owner.sourceId)!;
        return 'role' in source && source.role === role && plan.partition.covers(owner.ownerId, polygon);
      });
      // the far north arm retains complete source widths and exact levels
      expect(owns('walking', rectangle(56 - paved, 80, 56, 81))).toBe(true);
      expect(owns('curb', rectangle(56, 80, 56.2, 81))).toBe(true);
      expect(owns('gutter', rectangle(56.2, 80, 56.48, 81))).toBe(true);
      expect(owns('gutter-lip', rectangle(56.48, 80, 56.5, 81))).toBe(true);
      // the original upper-left corner has a two-metre roadway bevel with constant-width faces
      const roadOwner = plan.owners.find((owner) => plan.sources.some((source) =>
        source.id === owner.sourceId && source.kind === 'junction' && source.role === 'roadway'))!;
      expect(plan.partition.covers(roadOwner.ownerId, rectangle(56, 57.1, 56.2, 57.3))).toBe(true);
      for (const [role, offset] of [['gutter-lip', 0.01], ['gutter', 0.16], ['curb', 0.4], ['walking', 1]] as const) {
        const center: Vec2 = [55.5 - offset / Math.SQRT2, 58 + offset / Math.SQRT2];
        const sample = rectangle(center[0] - 0.002, center[1] - 0.002, center[0] + 0.002, center[1] + 0.002);
        expect(plan.owners.some((owner) => plan.sources.some((source) =>
          source.id === owner.sourceId && source.kind === 'junction' && source.role === role)
          && plan.partition.covers(owner.ownerId, sample, { encoding: 'binary' })), role).toBe(true);
      }
      const joint = output.sources.filter((source) => source.kind === 'junction');
      expect(joint.map((source) => source.role))
        .toEqual(['roadway', 'gutter-lip', 'gutter', 'curb', 'border', 'furnishing', 'walking', 'frontage']);
      expect(joint.every((source) => source.contactId === input.contact.id && source.contributors.length === 3)).toBe(true);
      for (const contributor of joint[0].contributors) {
        expect(contributor.runStation % input.stationPitch).toBe(0);
        const run = input.runs.find((row) => row.id === contributor.runId)!;
        const record = run.edges.find((row) => row.edgeId === contributor.edgeId)!;
        expect(contributor.runStation).toBe(record.forward ? record.start + contributor.distance : record.end - contributor.distance);
      }
      expect(output.ground.filter((owner) => owner.surface === 'gutter').every((owner) => owner.top === 0)).toBe(true);
      expect(output.ground.filter((owner) => owner.surface === 'curb').every((owner) => owner.top === 0.2)).toBe(true);
    }

    // the same bytes under reordered source records, repeated calls, a quarter turn and a fractional shift
    const input = junctionFixture();
    const expected = JunctionGround.build(input);
    expect(JunctionGround.build(input)).toEqual(expected);
    input.edges.reverse(); input.runs.reverse(); input.contact.arms.reverse();
    input.datum.grade.roadway.reverse(); input.datum.grade.sideBands!.reverse(); input.datum.spans.reverse();
    expect(JSON.stringify(JunctionGround.build(input))).toBe(JSON.stringify(expected));

    const transform = ([x, z]: Vec2): Vec2 => [120 - z + 0.123, x + 0.321];
    const turned = junctionFixture(4, transform);
    const turnedPlan = JunctionGround.plan(turned);
    const sample = rectangle(56.21, 80.1, 56.47, 80.9).map(transform);
    expect(turnedPlan.owners.some((owner) => owner.surface === 'gutter'
      && turnedPlan.partition.covers(owner.ownerId, sample, { encoding: 'binary' }))).toBe(true);
    for (const source of GroundCover.snapshot(turnedPlan).sources) {
      if (source.kind === 'junction') expect(source.contributors.every((row) => row.runStation % turned.stationPitch === 0)).toBe(true);
    }
  });

  it('hands every exact return role to disjoint original-arm fitting fields with shared transition supports', () => {
    for (const paved of [2, 6]) {
      const input = junctionFixture(paved), before = JSON.stringify(input);
      const fitting = JunctionGround.fitting(input), plan = JunctionGround.plan(input);
      expect(JSON.stringify(input)).toBe(before);
      expect(fitting.fields).toHaveLength(6);
      expect(new Set(fitting.fields.map((field) => field.id)).size).toBe(6);
      expect(fitting.transitions).toHaveLength(2);
      for (const [index, field] of fitting.fields.entries()) {
        const polygon = edgeMaskView({ mask: field.mask, encoding: fitting.encoding });
        for (const other of fitting.fields.slice(index + 1)) {
          const partition = SourcePartition.create({ id: 'field', source: polygon, coordinateScale: 1000 });
          partition.divide('field', { claims: [{ id: 'overlap', masks: [], edgeMasks: [other.mask], encoding: fitting.encoding }], remainderId: 'rest' });
          expect(partition.boundaries('overlap')).toEqual([]);
        }
        const source = plan.sources.find((row) => row.kind === 'junction' && row.role === 'curb')!;
        if (source.kind !== 'junction') throw Error('Missing return source');
        const contributor = source.contributors.find((row) => row.edgeId === field.edgeId)!;
        expect(field.handoff).toEqual({ distance: contributor.distance, runStation: contributor.runStation });
        expect(field.sourceIds.every((id) => plan.sources.some((row) => row.id === id && row.kind === 'junction'))).toBe(true);
        const edge = input.edges.find((row) => row.id === field.edgeId)!;
        const length = Math.hypot(edge.path[1][0] - edge.path[0][0], edge.path[1][1] - edge.path[0][1]);
        for (const axis of [0, 1]) {
          expect(field.frame.origin[axis] + field.frame.u[axis] * field.handoff.runStation)
            .toBeCloseTo(edge.path[0][axis] + (edge.path[1][axis] - edge.path[0][axis]) * field.handoff.distance / length, 10);
        }
      }
      for (const transition of fitting.transitions) {
        expect(transition.fieldIds.every((id) => fitting.fields.find((field) => field.id === id)!.transitionIds.includes(transition.id))).toBe(true);
        for (const id of transition.fieldIds) {
          const polygon = edgeMaskView({ mask: fitting.fields.find((field) => field.id === id)!.mask, encoding: fitting.encoding });
          expect(polygon).toContainEqual(transition.from);
          expect(polygon).toContainEqual(transition.to);
        }
      }
      // the fields exactly consume the retained return owners they name
      for (const owner of plan.owners.filter((owner) => fitting.fields[0].sourceIds.includes(owner.sourceId))) {
        const remainderId = `${owner.ownerId}:unfitted`;
        plan.partition.divide(owner.ownerId, { claims: fitting.fields.map((field) => ({
          id: `${owner.ownerId}:${field.id}`, masks: [], edgeMasks: [field.mask], encoding: fitting.encoding,
        })), remainderId });
        expect(plan.partition.boundaries(remainderId)).toEqual([]);
      }
      expect(() => verifyPartition({ source: plan.boundary, coordinateScale: 1000, partition: plan.partition.finish() })).not.toThrow();
      input.edges.reverse(); input.runs.reverse(); input.contact.arms.reverse();
      expect(JunctionGround.fitting(input)).toEqual(fitting);
    }

    // a quarter turn keeps every mask on its authored millimetre axes
    const transform = ([x, z]: Vec2): Vec2 => [120 - z + 0.123, x + 0.321];
    for (const field of JunctionGround.fitting(junctionFixture(4, transform)).fields) {
      expect(Math.abs(field.frame.u[0]) + Math.abs(field.frame.u[1])).toBe(1);
      for (const vertex of field.mask) for (const coordinate of vertex.from) expect(coordinate).toBe(Math.round(coordinate * 1000) / 1000);
    }
  });
});

describe('errors', () => {
  it('rejects malformed claims, unsupported junction sources and inconsistent snapshot metadata', () => {
    const input = straightClaims();
    const first = input.claims[0];
    expect(() => GroundCover.build({ boundary: [[190.0001, 433], [192, 433], [192, 435], [190, 435]], water: [], stationBays: [],
      masks: { roadway: [], curb: [], sidewalk: [], block: [], open: [] } })).toThrowError(invariant);
    for (const claims of [
      null as never,
      [first, first],
      [{ ...first, masks: [rectangle(-1, 10, 5, 20)] }],
      [{ ...first, masks: [rectangle(1, 1, 4, 4)] }],
      [{ ...first, source: { ...first.source, top: NaN } }],
      [{ ...first, source: { ...first.source, surface: 'gutter' } as GroundSource }],
    ]) {
      expect(() => GroundCover.plan({ ...input, claims })).toThrowError(invariant);
    }
    expect(() => GroundCover.plan({ ...input, format: 'future' as never })).toThrowError(invariant);

    const plan = GroundCover.plan({ ...input, claims: [first] });
    const owner = plan.owners.find((row) => row.sourceId === first.source.id)!;
    owner.top += 1;
    expect(() => GroundCover.snapshot(plan)).toThrowError(invariant);
    owner.top -= 1;
    plan.sources = plan.sources.filter((source) => source.id !== first.source.id);
    expect(() => GroundCover.snapshot(plan)).toThrowError(invariant);

    const junction = junctionFixture();
    for (const mutate of [
      (value: JunctionGroundInput) => { value.contact.arms.pop(); },
      (value: JunctionGroundInput) => { value.datum.grade.sideBands![0].top += 0.1; },
      (value: JunctionGroundInput) => { value.datum.grade.sideBands!.pop(); },
      (value: JunctionGroundInput) => { value.datum.boundary = rectangle(59, 49, 61, 51); },
      (value: JunctionGroundInput) => { value.setback = 50; },
      (value: JunctionGroundInput) => { value.remainder.id = `junction:${value.contact.id}:roadway`; },
    ]) {
      const changed = structuredClone(junction); mutate(changed);
      expect(() => JunctionGround.build(changed)).toThrowError(invariant);
    }
    // geometry-free junction provenance is checked at the public snapshot boundary
    const provenance = JunctionGround.plan(junctionFixture());
    const source = provenance.sources.find((row) => row.kind === 'junction')!;
    if (source.kind !== 'junction') throw Error('Missing junction source');
    source.contributors[0].spanIds = [];
    expect(() => GroundCover.snapshot(provenance)).toThrowError(invariant);
    // a reversed run member breaks the shared handoff phase
    const phase = junctionFixture();
    const run = phase.runs.find((row) => row.edges.length === 2)!;
    run.edges[0].forward = !run.edges[0].forward;
    expect(() => JunctionGround.fitting(phase)).toThrowError(invariant);
  });
});

function e103Input(): GroundCoverInput {
  const sources: { id: string; path: Polyline; width: number }[] = [
    { id: 'e94', path: [[842.93, 515.647], [853.001, 444.36], [853.778, 435.836]], width: 21 },
    { id: 'e95', path: [[882.042, 438.262], [842.93, 515.647]], width: 14 },
    { id: 'e96', path: [[853.778, 435.836], [858.45, 384.619], [859.086, 362.998]], width: 21 },
    { id: 'e103', path: [[859.086, 362.998], [920.339, 362.49]], width: 14 },
    { id: 'e111', path: [[920.339, 362.49], [882.042, 438.262]], width: 14 },
  ];
  const edges: StreetEdge[] = sources.map((source) => ({ ...source, class: 'road',
    from: `${source.path[0]}`, to: `${source.path.at(-1)}`, sidewalk: { left: 8.5, right: 8.5 },
    districtIds: [], level: 0, elevationProfile: [{ distance: 0, level: 0 }, { level: 0,
      distance: source.path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - source.path[i][0], p[1] - source.path[i][1]), 0) }],
  }));
  const boundary: Polygon = [[831, 351], [929, 351], [929, 528], [831, 528]];
  const datum = GradeDatum.plan({ boundary, edges, structures: [], roadwayTop: 0, pedestrianTop: 0.15 });
  const corner: Polygon = [[870.837, 370.003], [870.239, 370.306], [869.761, 370.774], [869.446, 371.366],
    [869.324, 372.025], [868.945, 384.928], [869.386, 369.913], [871.496, 369.895]];
  return { boundary, water: [], stationBays: [], masks: {
    roadway: [...datum.grade.roadway.flatMap((owner) => owner.polygons), corner],
    curb: [], sidewalk: datum.grade.corridors.flatMap((owner) => owner.polygons), block: [], open: [],
  } };
}

function straightClaims(): SourceGroundCoverInput {
  const sources = [30, 80].map((z, index) => ({
    id: `street-${index}`, class: index ? 'road' as const : 'street' as const,
    from: `a${index}`, to: `b${index}`, path: [[20, z], [80, z]] as Vec2[],
  }));
  const nodes = sources.flatMap((edge) => edge.path.map((position, index) => ({
    id: index ? edge.to : edge.from, position, edgeIds: [edge.id],
  })));
  const design = resolveStreetDesign({
    ...resolveStreetDesign(),
    sidewalkProfiles: [2, 4].map((paved) => ({
      id: `paved-${paved}`, curb: 0.2, border: 0, furnishing: 0.5, walking: paved - 0.5, frontage: 0,
      edge: { curbRise: paved === 2 ? 0.2 : 0.3, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' as const } } },
    })),
    sidewalkAssignments: [
      { district: 'residential', street: 'paved-2', road: 'paved-2' },
      { district: 'commercial', street: 'paved-4', road: 'paved-4' },
    ],
  });
  const edges: StreetEdge[] = StreetSections.plan(sources, nodes, design,
    (point) => point[1] < 60 ? 'residential' : 'commercial').edges.map((edge) => ({
    ...edge, districtIds: [], level: 5, elevationProfile: [{ distance: 0, level: 5 }, { distance: 60, level: 5 }],
  }));
  const datum = GradeDatum.plan({ groundFormat: 'side-bands-v1', boundary: rectangle(0, 0, 120, 120), edges,
    structures: [], roadwayTop: 5, pedestrianTop: 5.15 });
  const claims: GroundSourceClaim[] = [
    ...datum.grade.roadway.map((row) => ({
      source: { id: `road:${row.spanId}`, kind: 'roadway' as const,
        edgeId: datum.spans.find((span) => span.id === row.spanId)!.edgeId,
        spanIds: [row.spanId], surface: 'roadway' as const, bottom: 4.8, top: 5 },
      masks: row.polygons,
    })),
    ...datum.grade.sideBands!.map((row) => ({
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

function junctionFixture(paved = 4, transform: (point: Vec2) => Vec2 = (point) => point): JunctionGroundInput {
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
  const design = resolveStreetDesign({ ...resolveStreetDesign(),
    profiles: resolveStreetDesign().profiles.filter((profile) => profile.id !== 'one-way'),
    sidewalkProfiles: [{
      id: 'paved', curb: 0.2, border: 0, furnishing: 0, walking: paved, frontage: 0,
      edge: { curbRise: 0.2, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' } } },
    }] });
  const sections = StreetSections.plan(paths, nodes, design, () => 'residential');
  const edges: StreetEdge[] = sections.edges.map((edge) => ({ ...edge, districtIds: [], level: 0,
    elevationProfile: [{ distance: 0, level: 0 },
      { distance: Math.hypot(edge.path[1][0] - edge.path[0][0], edge.path[1][1] - edge.path[0][1]), level: 0 }] }));
  const datum = GradeDatum.plan({ boundary: rectangle(0, 0, 120, 120).map(transform), edges, structures: [],
    roadwayTop: 0, pedestrianTop: 0.2, groundFormat: 'side-bands-v1' });
  const contact = CrossingPlanner.contacts({ nodes, edges, reservations: StreetCorridors.reservations(edges) })
    .domains.find((domain) => domain.groups.some((group) => group.nodeId === 'join'))!;
  return { edges, runs: sections.runs, contact, datum, bottom: -0.2, roadwayTop: 0, setback: 2, stationPitch: 1,
    remainder: { id: 'open', kind: 'land', landId: 'city', surface: 'open', bottom: -0.2, top: 0.2 } };
}
