/** Source partition contract: retained ownership, exact masks, enclosures and the closed error set. */
import { describe, expect, it } from 'vitest';
import { edgeMaskView, edgePositionView } from './EdgeMasks';
import { edgeSupportEnclosures } from './EdgeSupportEnclosures';
import { prepareMasks } from './PreparedMasks';
import { SourcePartition } from './SourcePartition';
import { verifyPartition } from './verifyPartition';
import { verifyPublishedCover } from './published/verifyPublishedCover';
import type {
  PartitionClaim, PartitionEdgeMask, PartitionEdgeSupportInput, Polygon, PreparedPartitionMasks, SharedPartition,
} from './schema';

const rectangle = (x0: number, y0: number, x1: number, y1: number): Polygon => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const polygons = (partition: SharedPartition) => partition.pieces.map((piece) => piece.vertices.map((index) => partition.vertices[index]));
const invariant = expect.objectContaining({ code: 'E_INVARIANT' });

const divide = (source: Polygon, claim: PartitionClaim) => {
  const plan = SourcePartition.create({ id: 'source', source });
  plan.divide('source', { claims: [claim], remainderId: 'outside' });
  const partition = plan.finish();
  verifyPartition({ source, partition });
  return partition;
};

describe('retained ownership', () => {
  it('keeps declared millimetre algebra and explicit encodings apart from derived coordinates', () => {
    const source: Polygon = [[190.72, 433.846], [190.788, 433.93], [191, 433]];
    const midpoint: [number, number] = [190.754, 433.888];
    const plan = SourcePartition.create({ id: 'source', source, coordinateScale: 1000 });
    plan.divide('source', { claims: [{ id: 'claimed', masks: [[source[0], midpoint, source[2]]] }], remainderId: 'remainder' });
    const partition = plan.finish();
    verifyPartition({ source, partition, coordinateScale: 1000 });
    expect(partition.pieces.map((piece) => piece.vertices.length)).toEqual([3, 3]);
    expect(new Set(partition.vertices.map((point) => point.join(','))))
      .toEqual(new Set([...source, midpoint].map((point) => point.join(','))));
    // the declared scale is part of verification, and off-grid authored input fails
    expect(() => verifyPartition({ source, partition })).toThrowError(invariant);
    const offGrid = rectangle(0, 0, 1.0001, 1);
    expect(() => SourcePartition.create({ id: 'invalid', source: offGrid, coordinateScale: 1000 })).toThrowError(invariant);
    verifyPartition({ source: offGrid, partition: SourcePartition.create({ id: 'derived', source: offGrid }).finish() });

    // one instance answers both encodings, explicitly, and publishes reserved cells verbatim
    const mixedSource = rectangle(.001, .003, 10.001, 10.003), cell = rectangle(1.0001, 1.0002, 2.0001, 2.0002);
    const mixed = SourcePartition.create({ id: 'source', source: mixedSource, coordinateScale: 1000 });
    mixed.divide('source', { claims: [
      { id: 'derived', masks: [rectangle(-1, -1, 5.0001, 11)], encoding: 'binary' },
      { id: 'authored', masks: [rectangle(6.001, 1.001, 8.001, 8.001)], encoding: 'authored-1mm' },
    ], remainderId: 'rest' });
    expect(() => mixed.covers('derived', cell)).toThrowError(invariant);
    expect(mixed.covers('derived', cell, { encoding: 'binary' })).toBe(true);
    mixed.reserve('derived', { id: 'fixed', polygon: cell, encoding: 'binary' });
    const mixedPartition = mixed.finish();
    verifyPartition({ source: mixedSource, partition: mixedPartition, coordinateScale: 1000 });
    expect(mixedPartition.certificate.source.map((id) => mixedPartition.vertices[id])).toEqual(mixedSource);
    expect(mixedPartition.pieces.filter((piece) => piece.fixed)
      .map((piece) => piece.vertices.map((id) => mixedPartition.vertices[id]))).toEqual([cell]);
  });

  it('keeps holes, component handles, empty owners and mask priority exact through nested divisions', () => {
    const source = rectangle(0, 0, 10, 10), plan = SourcePartition.create({ id: 'source', source });
    plan.divide('source', { claims: [{ id: 'hole', masks: [rectangle(4, 4, 6, 6)] }, { id: 'empty', masks: [] }], remainderId: 'frame' });
    expect(plan.covers('frame', rectangle(2, 2, 8, 8))).toBe(false); // the hole is not the frame's land
    expect(plan.covers('frame', rectangle(1, 1, 4, 6))).toBe(true);
    plan.divide('empty', { claims: [], remainderId: 'still-empty' });
    expect(plan.boundaries('still-empty')).toEqual([]);
    verifyPartition({ source, partition: plan.finish() });

    // ordered masks take priority inside one owner, and separated pieces keep their signed holes
    const wide = rectangle(0, 0, 80, 40), islands = SourcePartition.create({ id: 'source', source: wide });
    const strips = Array.from({ length: 12 }, (_, index) => index * 6 + 2).flatMap((left) => [
      rectangle(left, 5, left + 3, 35), rectangle(left + 1, 5, left + 4, 35).reverse(),
    ]);
    islands.divide('source', { claims: [
      { id: 'islands', masks: strips }, { id: 'overlap', masks: [rectangle(3, 10, 5, 30)] },
    ], remainderId: 'surrounding' });
    expect(islands.loops('overlap')).toEqual([]);
    expect(islands.loops('islands')).toHaveLength(12);
    const components = islands.components('surrounding');
    expect(islands.components('surrounding')).toEqual(components);
    islands.divide(components[0].id, { claims: [{ id: 'nested', masks: [rectangle(-1, 2, 81, 8)] }], remainderId: 'nested-rest' });
    verifyPartition({ source: wide, partition: islands.finish() });
  });

  it('publishes protected cells verbatim while completing touching hole chains', () => {
    const source = rectangle(-5, -5, 5, 5), origin = [1.017, -.993], u = [.6, .8], pitch = [2, 2];
    const cell: Polygon = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([column, row]) => {
      const du = column * pitch[0], dv = row * pitch[1];
      return [Math.round(((origin[0] + u[0] * du) - u[1] * dv) * 1000) / 1000,
        Math.round(((origin[1] + u[1] * du) + u[0] * dv) * 1000) / 1000];
    });
    const plan = SourcePartition.create({ id: 'source', source });
    plan.reserve('source', { id: 'canonical', polygon: cell });
    plan.divide('source', { claims: [{ id: 'right', masks: [rectangle(.7, -6, 6, 6)] }], remainderId: 'left' });
    const partition = plan.finish();
    verifyPartition({ source, partition });
    const index = partition.pieces.findIndex((piece) => piece.ownerId === 'canonical');
    expect(partition.pieces[index].vertices.map((id) => partition.vertices[id])).toEqual(cell);
    // the cut that ends on the cell edge lives in the certificate, not in the published outline
    expect(partition.certificate.pieceChains[index].some((edge) => edge.length > 2)).toBe(true);

    const chains = rectangle(80, 230, 100, 250), holes = SourcePartition.create({ id: 'source', source: chains });
    holes.divide('source', { claims: [{ id: 'hole', masks: [
      [[83.142, 233.409], [83.188, 233.24], [85, 231], [85, 234]],
      rectangle(83.14199999999998, 233.40899999999993, 83.14200000000001, 233.40900000000005),
      [[84, 230], [85, 230.5], [86, 232]],
      [[86, 232], [90, 228], [94, 232], [90, 236]],
      [[86, 240], [90, 236], [94, 240], [90, 244]],
      [[95, 236], [96, 235], [97, 236], [96, 237]],
    ] }], remainderId: 'surrounding' });
    const chained = holes.finish();
    verifyPartition({ source: chains, partition: chained });
    expect(new Set(chained.pieces.map((piece) => piece.ownerId))).toEqual(new Set(['hole', 'surrounding']));
    expect(polygons(chained).every((ring) => ring.length >= 3)).toBe(true);
  });
});

describe('exact masks', () => {
  it('constructs affine edge positions once and retains their incidence through publication', () => {
    expect([
      edgePositionView({ encoding: 'authored-1mm', position: { from: [0, 0], to: [.003, 0], t: .7 } }),
      edgePositionView({ encoding: 'authored-1mm', position: { from: [.007, 0], to: [.008, 0], t: 2 ** -53 } }),
      edgePositionView({ position: { from: [0, 0], to: [1.5, 0], t: Number.MIN_VALUE } }),
    ]).toEqual([[.0021, 0], [.007, 0], [2 * Number.MIN_VALUE, 0]]);

    const source: Polygon = [[98, 234], [105, 234], [105, 239], [98, 239]];
    const low = .8885376086014405, high = .9354309661529501;
    const inner = { from: [150.258, 207.587] as [number, number], to: [94.668, 239.25] as [number, number] };
    const outer = { from: [152.114, 210.846] as [number, number], to: [96.524, 242.509] as [number, number] };
    const mask: PartitionEdgeMask = [{ ...outer, t: low }, { ...inner, t: high }, { ...inner, t: low }];
    expect(edgePositionView({ position: mask[1], encoding: 'authored-1mm' }))
      .toEqual(edgeMaskView({ mask, encoding: 'authored-1mm' })[1]);
    const build = (claim: PartitionClaim) => {
      const plan = SourcePartition.create({ id: 'city', source, coordinateScale: 1000 });
      plan.divide('city', { claims: [{ id: 'road', masks: [
        [inner.from, inner.to, [80, 190]], [[99.411, 236.547], [98.851, 236.988], [97.485, 237.644]],
      ] }], remainderId: 'curb' });
      plan.divide('curb', { claims: [claim], remainderId: 'rest' });
      const partition = plan.finish();
      verifyPartition({ source, partition, coordinateScale: 1000 });
      const cover = { boundary: source, exclusions: [], pieces: partition.pieces.map((piece, index) => ({
        id: `${piece.ownerId}:${index}`, polygon: piece.vertices.map((id) => partition.vertices[id]),
      })) };
      return JSON.parse(JSON.stringify(cover)) as typeof cover;
    };
    // re-imported numbers lose the incidence that the retained edge construction keeps
    expect(() => verifyPublishedCover(build({ id: 'landing', encoding: 'binary', masks: [[
      [102.72019433784592, 238.9797663011474], [98.2573925915575, 237.20555068130085],
      [100.86419433784593, 235.72076630114742],
    ]] }))).toThrowError(invariant);
    const exact = build({ id: 'landing', masks: [], edgeMasks: [mask] });
    verifyPublishedCover(exact);
    expect(exact.pieces.map((piece) => piece.id)).toEqual(['road:0', 'landing:1', 'rest:2']);
  });

  it('unions numeric, prepared and extrapolated masks, and rejects invalid construction', () => {
    const source = rectangle(0, 0, 10, 10);
    const stretched: PartitionEdgeMask = [
      { from: [0, 1], to: [4, 1], t: -.5 }, { from: [0, 1], to: [4, 1], t: 1.5 },
      { from: [0, 6], to: [4, 6], t: 1.5 }, { from: [0, 6], to: [4, 6], t: -.5 },
    ];
    expect(edgeMaskView({ mask: stretched, encoding: 'authored-1mm' })).toEqual([[-2, 1], [6, 1], [6, 6], [-2, 6]]);
    const plan = SourcePartition.create({ id: 'city', source, coordinateScale: 1000 });
    plan.divide('city', { claims: [{ id: 'field', masks: [[[8, 0], [10, 0], [10, 3], [8, 3]]], edgeMasks: [stretched] }], remainderId: 'rest' });
    expect(plan.covers('field', [[0, 1], [6, 1], [6, 6], [0, 6]])).toBe(true);
    expect(plan.covers('field', [[8, 0], [10, 0], [10, 3], [8, 3]])).toBe(true);
    verifyPartition({ source, partition: plan.finish(), coordinateScale: 1000 });

    // a prepared snapshot answers later divisions exactly as its live masks did
    const masks = [rectangle(.001, .001, 3.001, 9.999)];
    const preparedMasks = prepareMasks({ masks, encoding: 'authored-1mm' });
    const numeric = rectangle(3, 1, 5, 9), affine = rectangle(5, 1, 7, 9);
    const combined = divide(source, { id: 'inside', masks: [numeric], preparedMasks,
      edgeMasks: [affine.map((point) => ({ from: point, to: point, t: .5 }))] });
    const live = SourcePartition.create({ id: 'source', source, coordinateScale: 1000 });
    live.divide('source', { claims: [{ id: 'inside', masks: [...masks, numeric, affine] }], remainderId: 'outside' });
    expect(combined).toEqual(live.finish());
    masks[0][0][0] = -100; // the snapshot owns its geometry
    expect(divide(source, { id: 'inside', masks: [], preparedMasks })).toEqual(
      divide(source, { id: 'inside', masks: [], preparedMasks }));

    // views belong to the caller, in the caller's order
    const corner: Polygon = [[.0001, .0002], [1.0001, .0002], [1.0001, 1.0002], [.0001, 1.0002]];
    const ring: PartitionEdgeMask = corner.map((point, index) => index % 2
      ? { from: corner[(index + 1) % corner.length], to: point, t: 1 }
      : { from: point, to: corner[(index + 1) % corner.length], t: 0 });
    const view = edgeMaskView({ mask: ring });
    expect(view).toEqual(corner);
    expect(edgeMaskView({ mask: [...ring].reverse() })).toEqual([...corner].reverse());
    view[0][0] = 99;
    expect(edgeMaskView({ mask: ring })).toEqual(corner);

    expect(() => edgeMaskView({ mask: ring, encoding: 'authored-1mm' })).toThrowError(invariant);
    for (const t of [Infinity, NaN]) {
      expect(() => edgeMaskView({ mask: [{ ...ring[0], t }, ...ring.slice(1)] })).toThrowError(invariant);
    }
    expect(() => edgeMaskView({ mask: [ring[0], ring[2], ring[1], ring[3]] })).toThrowError(invariant);
    expect(() => prepareMasks({ masks: [rectangle(0, 0, 1.0001, 1)], encoding: 'authored-1mm' })).toThrowError(invariant);
    expect(() => prepareMasks({ masks: [[[0, 0], [3, 2], [0, 2], [2, 0]]] })).toThrowError(invariant);
    expect(() => divide(rectangle(0, 0, 1, 1), { id: 'inside', masks: [], preparedMasks: {} as PreparedPartitionMasks }))
      .toThrowError(invariant);
  });
});

describe('numeric enclosures', () => {
  it('returns tight bounds for retained boundaries and authored supports without moving geometry', () => {
    const source: Polygon = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const plan = SourcePartition.create({ id: 'source', source });
    plan.divide('source', { claims: [{ id: 'left', masks: [[[-1, -3], [1, 3], [-2, 3]]] }, { id: 'empty', masks: [] }], remainderId: 'right' });
    const before = plan.finish(), views = plan.boundaries('left'), bounds = plan.boundaryEnclosures('left');
    expect(bounds.map((ring) => ring.length)).toEqual(views.map((ring) => ring.length));
    expect(bounds.flat().some((point) => point.lower[0] === 1 / 3 && point.upper[0] === .33333333333333337)).toBe(true);
    expect(bounds.flat().every((point) => point.lower[1] === point.upper[1])).toBe(true);
    const original = structuredClone(bounds);
    bounds[0][0].lower[0] = 99;
    expect(plan.boundaryEnclosures('left')).toEqual(original);
    expect(plan.finish()).toEqual(before);
    expect(plan.boundaryEnclosures('empty')).toEqual([]);
    for (const id of ['source', 'unknown']) expect(() => plan.boundaryEnclosures(id)).toThrowError(invariant);

    // a declared decimal source encloses its own rounding; exact binary input does not pad
    const decimal: Polygon = [[.1, -1], [1, -1], [1, 1], [.1, 1]];
    expect(SourcePartition.create({ id: 'source', source: decimal }).boundaryEnclosures('source')[0])
      .toEqual(decimal.map((point) => ({ lower: point, upper: point })));
    const authored = SourcePartition.create({ id: 'source', source: decimal, coordinateScale: 1000 });
    expect(authored.boundaryEnclosures('source')[0][0]).toEqual({ lower: [.09999999999999999, -1], upper: [.1, -1] });
    expect(authored.boundaries('source')).toEqual([decimal]);

    const support: PartitionEdgeSupportInput = { from: [101, 201], to: [102, 202], encoding: 'authored-1mm' };
    const enclosure = edgeSupportEnclosures(support);
    expect(enclosure).toEqual({
      from: { lower: [100.99999999999999, 200.99999999999997], upper: [101.00000000000001, 201.00000000000003] },
      to: { lower: [101.99999999999999, 201.99999999999997], upper: [102.00000000000001, 202.00000000000003] },
    });
    expect(edgeSupportEnclosures({ ...support, from: support.to, to: support.from })).toEqual({ from: enclosure.to, to: enclosure.from });
    // a constant coordinate keeps a zero-width box at its published value
    expect(edgeSupportEnclosures({ from: [1, -.007], to: [2, -.007], encoding: 'authored-1mm' }).from.lower[1]).toBe(-.007);
    expect(() => edgeSupportEnclosures({ ...support, from: [.0001, 0] })).toThrowError(invariant);
    expect(() => edgeSupportEnclosures({ ...support, encoding: 'binary' } as unknown as PartitionEdgeSupportInput)).toThrowError(invariant);
  });
});

describe('errors', () => {
  it('rejects corrupted certificates, invalid reservations and protected-owner edits', () => {
    const source = rectangle(0, 0, 10, 10), plan = SourcePartition.create({ id: 'source', source });
    plan.divide('source', { claims: [{ id: 'half', masks: [rectangle(0, 0, 5, 10)] }], remainderId: 'rest' });
    const result = plan.finish();
    for (const corrupt of [
      (value: SharedPartition) => { value.pieces.pop(); value.certificate.pieceChains.pop(); },
      (value: SharedPartition) => { value.pieces.push(value.pieces[0]); value.certificate.pieceChains.push(value.certificate.pieceChains[0]); },
      (value: SharedPartition) => { value.vertices[0][0] += .001; },
      (value: SharedPartition) => { value.certificate.sourceChains[0][0] = value.certificate.source[2]; },
    ]) {
      const changed = structuredClone(result); corrupt(changed);
      expect(() => verifyPartition({ source, partition: changed })).toThrowError(invariant);
    }

    const guarded = SourcePartition.create({ id: 'source', source });
    expect(() => guarded.reserve('source', { id: 'outside', polygon: rectangle(-1, 1, 2, 2) })).toThrowError(invariant);
    guarded.reserve('source', { id: 'cell', polygon: rectangle(1, 1, 2, 2) });
    expect(() => guarded.divide('cell', { claims: [], remainderId: 'new' })).toThrowError(invariant);
    expect(() => guarded.divide('source', { claims: [{ id: 'cell', masks: [] }], remainderId: 'rest' })).toThrowError(invariant);
    expect(() => guarded.boundaries('unknown')).toThrowError(invariant);
    expect(() => SourcePartition.create({ id: 'crossed', source: [[0, 0], [3, 2], [0, 2], [2, 0]] })).toThrowError(invariant);
  });
});
