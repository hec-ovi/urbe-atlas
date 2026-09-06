import { expect, it } from 'vitest';
import { prepareMasks } from './PreparedMasks';
import { SourcePartition } from './SourcePartition';
import { verifyPartition } from './verifyPartition';
import type { PartitionClaim, Polygon, PreparedPartitionMasks } from './schema';

const rectangle = (x0: number, y0: number, x1: number, y1: number): Polygon => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const divide = (source: Polygon, claim: PartitionClaim) => {
  const plan = SourcePartition.create({ id: 'source', source });
  plan.divide('source', { claims: [claim], remainderId: 'outside' });
  const partition = plan.finish();
  verifyPartition({ source, partition });
  return partition;
};

it('reuses an immutable mask snapshot with the same exact ownership and certificate', () => {
  const masks = Array.from({ length: 12 }, (_, index) => rectangle(index * 5 + 1, -10, index * 5 + 3, 10));
  const preparedMasks = prepareMasks({ masks });
  const source = rectangle(0, 0, 4, 4);
  const expected = divide(source, { id: 'inside', masks });
  masks[0][0][0] = -100;
  const first = divide(source, { id: 'inside', masks: [], preparedMasks });
  expect(first).toEqual(expected);
  first.vertices[0][0] = -200;
  expect(divide(source, { id: 'inside', masks: [], preparedMasks })).toEqual(expected);
  const enclosed = divide(rectangle(1.5, 1, 2.5, 2), { id: 'inside', masks: [], preparedMasks });
  expect(enclosed.pieces.map(piece => piece.ownerId)).toEqual(['inside']);
});

it('combines independently encoded prepared masks with numeric and affine claims', () => {
  const source = rectangle(0, 0, 10, 10), masks = [rectangle(.001, .001, 3.001, 9.999)];
  const preparedMasks = prepareMasks({ masks, encoding: 'authored-1mm' });
  const numeric = rectangle(3, 1, 5, 9), affine = rectangle(5, 1, 7, 9);
  const combined = divide(source, { id: 'inside', masks: [numeric], preparedMasks,
    edgeMasks: [affine.map(point => ({ from: point, to: point, t: .5 }))] });
  const plan = SourcePartition.create({ id: 'source', source, coordinateScale: 1000 });
  plan.divide('source', { claims: [{ id: 'inside', masks: [...masks, numeric, affine] }], remainderId: 'outside' });
  expect(combined).toEqual(plan.finish());
  const empty = divide(source, { id: 'inside', masks: [], preparedMasks: prepareMasks({ masks: [] }) });
  expect(empty.pieces.map(piece => piece.ownerId)).toEqual(['outside']);
});

it('validates prepared geometry immediately and rejects unknown handles', () => {
  expect(() => prepareMasks({ masks: [rectangle(0, 0, 1.0001, 1)], encoding: 'authored-1mm' }))
    .toThrow(expect.objectContaining({ code: 'E_INVARIANT' }));
  expect(() => prepareMasks({ masks: [[[0, 0], [3, 2], [0, 2], [2, 0]]] }))
    .toThrow(expect.objectContaining({ code: 'E_INVARIANT' }));
  expect(() => divide(rectangle(0, 0, 1, 1), { id: 'inside', masks: [], preparedMasks: {} as PreparedPartitionMasks }))
    .toThrow(expect.objectContaining({ code: 'E_INVARIANT' }));
});
