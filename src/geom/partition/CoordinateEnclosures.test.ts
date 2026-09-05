import { describe, expect, it } from 'vitest';
import { SourcePartition } from './SourcePartition';
import { verifyPartition } from './verifyPartition';
import type { Polygon } from './schema';

describe('retained coordinate enclosure diagnostics', () => {
  it('returns tight signed intersection bounds in matching topology without changing publication', () => {
    const source: Polygon = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const plan = SourcePartition.create({ id: 'source', source });
    plan.divide('source', { claims: [{ id: 'left', masks: [[[-1, -3], [1, 3], [-2, 3]]] }, { id: 'empty', masks: [] }], remainderId: 'right' });
    const before = plan.finish(), views = plan.boundaries('left'), bounds = plan.boundaryEnclosures('left');
    expect(bounds.map(ring => ring.length)).toEqual(views.map(ring => ring.length));
    expect(bounds.flat().some(point => point.lower[0] === 1 / 3 && point.upper[0] === .33333333333333337)).toBe(true);
    expect(bounds.flat().some(point => point.lower[0] === -.33333333333333337 && point.upper[0] === -1 / 3)).toBe(true);
    expect(bounds.flat().every(point => point.lower[1] === point.upper[1])).toBe(true);
    const original = structuredClone(bounds);
    bounds[0][0].lower[0] = 99;
    expect(plan.boundaryEnclosures('left')).toEqual(original);
    expect(plan.finish()).toEqual(before);
    verifyPartition({ source, partition: JSON.parse(JSON.stringify(before)) });
    expect(plan.boundaryEnclosures('empty')).toEqual([]);
    for (const id of ['source', 'unknown']) {
      expect(() => plan.boundaryEnclosures(id)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    }
  });

  it('distinguishes exact binary inputs from declared decimal coordinates without padding exact fits', () => {
    const source: Polygon = [[.1, -1], [1, -1], [1, 1], [.1, 1]];
    const binary = SourcePartition.create({ id: 'source', source });
    expect(binary.boundaryEnclosures('source')[0]).toEqual(source.map(point => ({ lower: point, upper: point })));
    const authored = SourcePartition.create({ id: 'source', source, coordinateScale: 1000 });
    const bounds = authored.boundaryEnclosures('source')[0];
    expect(bounds[0]).toEqual({ lower: [.09999999999999999, -1], upper: [.1, -1] });
    expect(bounds[1]).toEqual({ lower: [1, -1], upper: [1, -1] });
    expect(authored.boundaries('source')).toEqual([source]);
  });

  it('encloses both signed half-subnormal intersections and exact serialized subnormal sources', () => {
    const tiny = Number.MIN_VALUE;
    const source: Polygon = [[-tiny, 0], [tiny, 0], [tiny, tiny], [-tiny, tiny]];
    for (const positive of [true, false]) {
      const plan = SourcePartition.create(JSON.parse(JSON.stringify({ id: 'source', source })));
      expect(plan.boundaryEnclosures('source')[0]).toEqual(source.map(point => ({ lower: point, upper: point })));
      const mask: Polygon = positive ? [[0, -tiny], [tiny, tiny], [-tiny, tiny]] : [[-tiny, -tiny], [0, tiny], [-tiny, tiny]];
      plan.divide('source', { claims: [{ id: 'left', masks: [mask] }], remainderId: 'right' });
      const before = plan.finish(), bounds = plan.boundaryEnclosures('left').flat();
      expect(bounds.some(point => point.lower[0] === (positive ? 0 : -tiny) && point.upper[0] === (positive ? tiny : 0))).toBe(true);
      expect(plan.finish()).toEqual(before);
      verifyPartition({ source, partition: JSON.parse(JSON.stringify(before)) });
    }
  });
});
