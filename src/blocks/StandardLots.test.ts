import { describe, expect, it } from 'vitest';
import { StandardLots, STANDARD_LOT_SIZES, type BlockCells } from './StandardLots';
import { Rng } from '../core/rng';
import { intersection } from '../geom/clip';
import { area } from '../geom/polygon';
import type { Polygon } from '../../schema/blueprint';

const rectangle = (x: number, z: number, width: number, depth: number): Polygon =>
  [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]];

const rng = () => Rng.from('lots', 'test');

describe('standard lots', () => {
  it('fills a block with catalog sizes on the building grid and leaves the rest open', () => {
    const region = rectangle(40.9, 41.4, 118, 96);
    const plan = StandardLots.plan(region, 'downtown', rng());
    expect(plan.cells.length).toBeGreaterThan(5);
    for (const cell of plan.cells) {
      const size = StandardLots.sizeOf(cell.polygon);
      expect(size?.id, `cell ${cell.row}/${cell.index}`).toBe(cell.sizeId);
      // corners land on the 0.5 m building grid, so one kit fits the size wherever it stands
      expect(cell.polygon.flat().every(value => Math.abs(value * 2 - Math.round(value * 2)) < 1e-9)).toBe(true);
      expect(intersection([cell.polygon], [region]).reduce((sum, piece) => sum + area(piece), 0)).toBeCloseTo(area(cell.polygon), 6);
    }
    const covered = plan.cells.reduce((sum, cell) => sum + area(cell.polygon), 0);
    const open = plan.openAreas.reduce((sum, piece) => sum + area(piece), 0);
    expect(covered + open).toBeCloseTo(area(region), 3);
    expect(covered / area(region)).toBeGreaterThan(0.75);
    expect(intersection(plan.cells.map(cell => cell.polygon), plan.openAreas)).toEqual([]);
  });

  it('never overlaps two lots and repeats exactly for the same seed', () => {
    const region = rectangle(10, 10, 140, 130);
    const first = StandardLots.plan(region, 'mixed', rng());
    expect(JSON.stringify(StandardLots.plan(region, 'mixed', rng()))).toBe(JSON.stringify(first));
    for (let i = 0; i < first.cells.length; i++) {
      for (let j = i + 1; j < first.cells.length; j++) {
        expect(intersection([first.cells[i].polygon], [first.cells[j].polygon])).toEqual([]);
      }
    }
  });

  it('keeps industrial land on its own sizes and skips land a cell cannot cover', () => {
    const industrial = StandardLots.plan(rectangle(0, 0, 160, 120), 'industrial', rng());
    expect(new Set(industrial.cells.map(cell => cell.sizeId)))
      .toEqual(new Set(['lot-24x40', 'lot-40x40', 'lot-40x56', 'lot-56x56'].filter(id =>
        industrial.cells.some(cell => cell.sizeId === id))));
    expect(industrial.cells.every(cell => STANDARD_LOT_SIZES.find(size => size.id === cell.sizeId)!.area >= 960)).toBe(true);

    // an L-shaped region drops every cell that would leave it
    const cut: Polygon = [[0, 0], [120, 0], [120, 60], [60, 60], [60, 120], [0, 120]];
    const plan = StandardLots.plan(cut, 'residential', rng());
    expect(plan.cells.length).toBeGreaterThan(0);
    for (const cell of plan.cells) {
      expect(intersection([cell.polygon], [cut]).reduce((sum, piece) => sum + area(piece), 0)).toBeCloseTo(area(cell.polygon), 6);
    }
  });

  it('merges neighbouring cells into 10 to 30 landmark plots', () => {
    const blocks: BlockCells[] = Array.from({ length: 120 }, (_, blockIndex) => ({
      blockIndex, cells: StandardLots.plan(rectangle(blockIndex * 200, 0, 118, 96), 'commercial', Rng.from('lots', `block${blockIndex}`)).cells,
    }));
    const landmarks = StandardLots.landmarks(blocks, rng());
    expect(landmarks.size).toBe(12);
    for (const [blockIndex, landmark] of landmarks) {
      const source = blocks[blockIndex].cells;
      expect(landmark.cells.length).toBeGreaterThanOrEqual(2);
      expect(landmark.cells.every(cell => source.includes(cell))).toBe(true);
      // one plot covering its cells exactly, and outside the catalog
      expect(area(landmark.polygon)).toBeCloseTo(landmark.cells.reduce((sum, cell) => sum + area(cell.polygon), 0), 6);
      expect(StandardLots.sizeOf(landmark.polygon)).toBeNull();
    }
    expect(StandardLots.landmarks(blocks.slice(0, 20), rng()).size).toBe(5);
  });
});
