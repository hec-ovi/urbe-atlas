import { describe, expect, it } from 'vitest';
import { edgeMaskView, edgePositionView } from './EdgeMasks';
import { SourcePartition } from './SourcePartition';
import { verifyPartition } from './verifyPartition';
import { verifyPublishedCover } from './published/verifyPublishedCover';
import type { PartitionClaim, PartitionEdgeMask, Polygon } from './schema';

describe('exact source-edge construction', () => {
  it('represents finite affine positions with wide denominators and subnormal halfway rounding', () => {
    const view = (from: number, to: number, t: number) => edgePositionView({ position: { from: [from, 0], to: [to, 0], t } });
    expect(view(1, 2, 1e-300)).toEqual([1, 0]);
    expect(view(0, 1, Number.MIN_VALUE)).toEqual([Number.MIN_VALUE, 0]);
    expect(view(0, .5, Number.MIN_VALUE)).toEqual([0, 0]);
    expect(view(0, 1.5, Number.MIN_VALUE)).toEqual([2 * Number.MIN_VALUE, 0]);
    expect(view(0, 1, Number.MAX_VALUE)).toEqual([Number.MAX_VALUE, 0]);
  });

  it('preserves a road and landing incidence through saved publication using retained source construction', () => {
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
        id: `${piece.ownerId}:${index}`, polygon: piece.vertices.map(id => partition.vertices[id]),
      })) };
      return JSON.parse(JSON.stringify(cover)) as typeof cover;
    };
    const numeric = build({ id: 'landing', encoding: 'binary', masks: [[
      [102.72019433784592, 238.9797663011474], [98.2573925915575, 237.20555068130085],
      [100.86419433784593, 235.72076630114742],
    ]] });
    expect(() => verifyPublishedCover(numeric)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    const exact = build({ id: 'landing', masks: [], edgeMasks: [mask] });
    verifyPublishedCover(exact);
    expect(exact.pieces.map(piece => piece.id)).toEqual(['road:0', 'landing:1', 'rest:2']);
  });

  it('unions numeric and edge masks with finite affine extrapolation and inherited endpoint encoding', () => {
    const source: Polygon = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const mask: PartitionEdgeMask = [
      { from: [0, 1], to: [4, 1], t: -.5 }, { from: [0, 1], to: [4, 1], t: 1.5 },
      { from: [0, 6], to: [4, 6], t: 1.5 }, { from: [0, 6], to: [4, 6], t: -.5 },
    ];
    expect(edgeMaskView({ mask, encoding: 'authored-1mm' })).toEqual([[-2, 1], [6, 1], [6, 6], [-2, 6]]);
    const plan = SourcePartition.create({ id: 'city', source, coordinateScale: 1000 });
    plan.divide('city', { claims: [{ id: 'field', masks: [[[8, 0], [10, 0], [10, 3], [8, 3]]], edgeMasks: [mask] }], remainderId: 'rest' });
    expect(plan.covers('field', [[0, 1], [6, 1], [6, 6], [0, 6]])).toBe(true);
    expect(plan.covers('field', [[8, 0], [10, 0], [10, 3], [8, 3]])).toBe(true);
    const partition = plan.finish();
    verifyPartition({ source, partition, coordinateScale: 1000 });
    verifyPublishedCover({ boundary: source, exclusions: [], pieces: partition.pieces.map((piece, index) => ({
      id: String(index), polygon: piece.vertices.map(id => partition.vertices[id]),
    })) });
  });

  it('preserves endpoint values and caller order in independent views and rejects invalid construction', () => {
    const source: Polygon = [[.0001, .0002], [1.0001, .0002], [1.0001, 1.0002], [.0001, 1.0002]];
    const mask: PartitionEdgeMask = source.map((point, index) => index % 2
      ? { from: source[(index + 1) % source.length], to: point, t: 1 }
      : { from: point, to: source[(index + 1) % source.length], t: 0 });
    const view = edgeMaskView({ mask });
    expect(view).toEqual(source);
    expect(edgeMaskView({ mask: [...mask].reverse() })).toEqual([...source].reverse());
    view[0][0] = 99;
    expect(edgeMaskView({ mask })).toEqual(source);
    expect(() => edgeMaskView({ mask, encoding: 'authored-1mm' })).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    for (const t of [Infinity, NaN]) {
      expect(() => edgeMaskView({ mask: [{ ...mask[0], t }, ...mask.slice(1)] }))
        .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    }
    const plan = SourcePartition.create({ id: 'source', source: [[0, 0], [2, 0], [2, 2], [0, 2]], coordinateScale: 1000 });
    expect(() => plan.divide('source', { claims: [{ id: 'field', masks: [], edgeMasks: [mask] }], remainderId: 'rest' }))
      .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    plan.divide('source', { claims: [{ id: 'field', masks: [], edgeMasks: [mask], encoding: 'binary' }], remainderId: 'rest' });
    verifyPartition({ source: [[0, 0], [2, 0], [2, 2], [0, 2]], partition: plan.finish(), coordinateScale: 1000 });
    expect(() => edgeMaskView({ mask: [mask[0], mask[2], mask[1], mask[3]] }))
      .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });
});
