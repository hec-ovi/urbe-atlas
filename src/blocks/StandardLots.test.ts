import { describe, expect, it } from 'vitest';
import { BlockTemplates } from './StandardLots';

describe('lot rows', () => {
  it('run every row to the longest frontage its widths can fill, so no street face stops a lot short of its corner', () => {
    const templates = new BlockTemplates('rows');
    for (const zone of ['industrial', 'residential', 'downtown'] as const) {
      for (const inside of [104, 112, 96, 88]) {
        const plan = templates.get({ origin: [0, 0], width: inside + 10, depth: inside + 10,
          interior: { offset: [5, 5], width: inside, depth: inside } }, zone, 'mid');
        const rows = new Map<number, number>();
        plan.lots.forEach((value, index) => {
          const { row } = plan.rows[index];
          // Rows 0 and 1 run along the block, 2 and 3 across it between them.
          const frontage = row < 2 ? value.width : value.depth;
          rows.set(row, (rows.get(row) ?? 0) + frontage);
        });
        for (const [row, filled] of rows) {
          const length = row < 2 ? inside : inside - 2 * plan.lots.find((_, index) => plan.rows[index].row === 0)!.depth;
          // A row closes on the longest frontage its widths sum to, so what it leaves
          // is narrower than the narrowest lot the zone cuts: one more would fit otherwise.
          expect(length - filled, `${zone} ${inside} row ${row}`).toBeLessThan(zone === 'industrial' ? 24 : 16);
        }
      }
    }
  });
});
