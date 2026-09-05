import { describe, expect, it } from 'vitest';
import { SourcePartition } from './SourcePartition';
import { verifyPartition } from './verifyPartition';
import type { Polygon, SharedPartition } from './schema';

const rectangle = (x0: number, y0: number, x1: number, y1: number): Polygon => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const polygons = (partition: SharedPartition) => partition.pieces.map(piece => piece.vertices.map(index => partition.vertices[index]));

describe('source-preserving partition contract', () => {
  it('preserves an oblique source through the public split that loses its snapped remainder', () => {
    const source: Polygon = [[98.81, 236.753], [99.39, 236.305], [99.394, 236.303]];
    const mask: Polygon = [[96.29524550470775, 225.730243166496], [103.32603035407236, 238.41164941351548],
      [100.70229113055107, 239.86629455476333], [93.67150628118647, 227.18488830774385]];
    const build = () => {
      const plan = SourcePartition.create({ id: 'ground', source });
      plan.divide('ground', { claims: [{ id: 'crossing', masks: [mask] }], remainderId: 'other' });
      const result = plan.finish();
      verifyPartition({ source, partition: result });
      return result;
    };
    const result = build();
    expect(new Set(result.pieces.map(piece => piece.ownerId))).toEqual(new Set(['crossing', 'other']));
    expect(result.vertices.some(point => point.some(value => Math.round(value * 1000) / 1000 !== value))).toBe(true);
    expect(result).toEqual(build());
  });

  it('retains canonical fixed cell outlines while completing holes and nested ownership', () => {
    const source = rectangle(-5, -4, 8, 6), cell = rectangle(0, 0, 2, 2), adjacent = rectangle(2, 0, 4, 2);
    const plan = SourcePartition.create({ id: 'source', source });
    plan.divide('source', { claims: [{ id: 'core', masks: [rectangle(-4, -3, 7, 5)] }], remainderId: 'border' });
    expect(plan.covers('core', cell)).toBe(true);
    plan.reserve('core', { id: 'cell', polygon: cell });
    expect(plan.covers('core', cell)).toBe(false);
    plan.reserve('core', { id: 'adjacent', polygon: adjacent });
    expect(plan.loops('core')).toHaveLength(2);
    const result = plan.finish();
    verifyPartition({ source, partition: result });
    expect(result.pieces.filter(piece => piece.fixed).map(piece => piece.vertices.map(id => result.vertices[id]))).toEqual([cell, adjacent]);
    expect(result.pieces.some(piece => piece.ownerId === 'core')).toBe(true);
    const views = plan.boundaries('core');
    views[0][0][0] += 99;
    expect(polygons(plan.finish())).toEqual(polygons(result));
  });

  it('keeps exact component handles and empty divisions without reimporting numeric views', () => {
    const source = rectangle(0, 0, 10, 10), plan = SourcePartition.create({ id: 'source', source });
    plan.divide('source', { claims: [{ id: 'middle', masks: [rectangle(4, -1, 6, 11)] },
      { id: 'empty', masks: [] }], remainderId: 'sides' });
    plan.divide('empty', { claims: [], remainderId: 'still-empty' });
    expect(plan.boundaries('still-empty')).toEqual([]);
    const components = plan.components('sides');
    expect(components).toHaveLength(2);
    expect(plan.components('sides')).toEqual(components);
    plan.divide(components[0].id, { claims: [{ id: 'nested', masks: [rectangle(-1, 2, 11, 8)] }], remainderId: 'nested-remainder' });
    verifyPartition({ source, partition: plan.finish() });
  });

  it('assigns each nested hole to its immediate exterior component', () => {
    const source = rectangle(0, 0, 30, 30), plan = SourcePartition.create({ id: 'source', source });
    const frame = (low: number, high: number) => [rectangle(low, low, high, low + 2),
      rectangle(low, high - 2, high, high), rectangle(low, low + 2, low + 2, high - 2),
      rectangle(high - 2, low + 2, high, high - 2)];
    plan.divide('source', { claims: [{ id: 'frames', masks: [...frame(0, 30), ...frame(10, 20)] }], remainderId: 'gaps' });
    const components = plan.components('frames');
    expect(components).toHaveLength(2);
    expect(components.map(component => plan.loops(component.id).length)).toEqual([2, 2]);
    verifyPartition({ source, partition: plan.finish() });
  });

  it('publishes the consumer canonical cell unchanged when a solid cut terminates on its edge', () => {
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
    const index = partition.pieces.findIndex(piece => piece.ownerId === 'canonical');
    expect(partition.pieces[index].vertices.map(id => partition.vertices[id])).toEqual(cell);
    expect(partition.certificate.pieceChains[index].some(edge => edge.length > 2)).toBe(true);
  });

  it('conserves unresolved corners and the interior sectors of touching hole chains', () => {
    const source = rectangle(80, 230, 100, 250), plan = SourcePartition.create({ id: 'source', source });
    plan.divide('source', { claims: [{ id: 'hole', masks: [
      [[83.142, 233.409], [83.188, 233.24], [85, 231], [85, 234]],
      rectangle(83.14199999999998, 233.40899999999993, 83.14200000000001, 233.40900000000005),
      [[84, 230], [85, 230.5], [86, 232]],
      [[86, 232], [90, 228], [94, 232], [90, 236]],
      [[86, 240], [90, 236], [94, 240], [90, 244]],
      [[95, 236], [96, 235], [97, 236], [96, 237]],
    ] }], remainderId: 'surrounding' });
    const partition = plan.finish();
    verifyPartition({ source, partition });
    expect(new Set(partition.pieces.map(piece => piece.ownerId))).toEqual(new Set(['hole', 'surrounding']));
  });

  it('publishes both incidences of derived solid boundary junctions', () => {
    const source = rectangle(80, 230, 100, 250), plan = SourcePartition.create({ id: 'source', source });
    plan.divide('source', { claims: [{ id: 'core', masks: [rectangle(81, 230.5, 99, 249)] }], remainderId: 'border' });
    plan.divide('core', { claims: [{ id: 'hole', masks: [
      [[83.142, 233.409], [83.188, 233.24], [85, 231], [85, 234]],
      rectangle(83.14199999999998, 233.40899999999993, 83.14200000000001, 233.40900000000005),
    ] }], remainderId: 'surrounding' });
    const partition = plan.finish();
    verifyPartition({ source, partition });
    expect(partition.certificate.pieceChains.every(ring => ring.every(edge => edge.length === 2))).toBe(true);
  });

  it('rejects missing faces, moved emitted vertices and corrupted source chains', () => {
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
      expect(() => verifyPartition({ source, partition: changed })).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    }
  });

  it('rejects outside reservations, repeated IDs and protected-owner edits', () => {
    const source = rectangle(0, 0, 10, 10), plan = SourcePartition.create({ id: 'source', source });
    expect(() => plan.reserve('source', { id: 'outside', polygon: rectangle(-1, 1, 2, 2) })).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    plan.reserve('source', { id: 'cell', polygon: rectangle(1, 1, 2, 2) });
    expect(() => plan.divide('cell', { claims: [], remainderId: 'new' })).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    expect(() => plan.divide('source', { claims: [{ id: 'cell', masks: [] }], remainderId: 'rest' })).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    expect(() => plan.boundaries('unknown')).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    expect(() => SourcePartition.create({ id: 'crossed', source: [[0, 0], [3, 2], [0, 2], [2, 0]] }))
      .toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });
});
