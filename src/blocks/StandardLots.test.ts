import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BlockTemplates, STANDARD_LOT_SIZES } from './StandardLots';
import { coreFitForRect } from '../zoning/core';

/** Exterior's piece-kit request: a kit building stands on a lot of whole 8 m bays. */
const KIT_REQUEST = new URL('../../../exterior/schemas/kit-request.schema.json', import.meta.url);

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
        // The gate a closed courtyard opens through is a side-row lot left open on purpose: a
        // lot-wide hole in a side row, where a row's own leftover is narrower than any lot.
        const ring = plan.lots.find((_, index) => plan.rows[index].row === 0)!.depth;
        const widths = STANDARD_LOT_SIZES.filter((size) => size.depth === ring).map((size) => size.width);
        for (const area of plan.openAreas) {
          const row = area.offset[0] === 5 ? 2 : area.offset[0] === 5 + inside - ring ? 3 : -1;
          if (row < 0 || area.width !== ring || !widths.includes(area.depth)) continue;
          rows.set(row, (rows.get(row) ?? 0) + area.depth);
        }
        for (const [row, filled] of rows) {
          const length = row < 2 ? inside : inside - 2 * plan.lots.find((_, index) => plan.rows[index].row === 0)!.depth;
          // A row closes on the longest frontage its widths sum to, so what it leaves
          // is narrower than the narrowest lot the zone cuts: one more would fit otherwise.
          expect(length - filled, `${zone} ${inside} row ${row}`).toBeLessThan(zone === 'industrial' ? 24 : 16);
        }
      }
    }
  });

  it('opens every closed courtyard onto a side street through one gate, the narrowest side lot left open', () => {
    const templates = new BlockTemplates('gates');
    for (const zone of ['industrial', 'residential', 'downtown', 'mixed', 'commercial'] as const) {
      for (const inside of [104, 112, 96]) {
        const plan = templates.get({ origin: [0, 0], width: inside + 10, depth: inside + 10,
          interior: { offset: [5, 5], width: inside, depth: inside } }, zone, 'mid');
        const sideRows = plan.rows.filter(({ row }) => row >= 2).length;
        const ring = plan.lots.find((_, index) => plan.rows[index].row === 0)!.depth;
        const middle = inside - 2 * ring;
        // Lots and open ground tile the buildable land exactly.
        const covered = plan.lots.reduce((sum, lot) => sum + lot.width * lot.depth, 0)
          + plan.openAreas.reduce((sum, area) => sum + area.width * area.depth, 0);
        expect(covered, `${zone} ${inside}`).toBeCloseTo(inside * inside, 6);
        // A courtyard with no side rows reaches both side streets on its own.
        if (middle <= 0 || !sideRows && plan.openAreas.some((area) => area.offset[0] === 5 && area.width === inside)) continue;
        const courtyard = plan.openAreas.find((area) => area.offset[0] === 5 + ring && area.offset[1] === 5 + ring)!;
        expect(courtyard, `${zone} ${inside} courtyard`).toBeDefined();
        // Exactly one lot-wide gate joins the courtyard to a side street.
        const widths = STANDARD_LOT_SIZES.filter((size) => size.depth === ring).map((size) => size.width);
        const gates = plan.openAreas.filter((area) => area !== courtyard && area.width === ring && widths.includes(area.depth)
          && (area.offset[0] === 5 || area.offset[0] + area.width === 5 + inside));
        expect(gates, `${zone} ${inside} gate`).toHaveLength(1);
      }
    }
  });

  it('cuts only lots a kit building stands on whole and an Interior core plate takes', () => {
    const bays = (side: number) => side / 8;
    for (const size of STANDARD_LOT_SIZES) {
      // Exterior's kit: an edge of 8N m with N at least two, corner arms and N-1 straight pieces.
      expect(Number.isInteger(bays(size.width)) && bays(size.width) >= 2, size.id).toBe(true);
      expect(Number.isInteger(bays(size.depth)) && bays(size.depth) >= 2, size.id).toBe(true);
      // A building filling the lot hosts at least a walkup core, two floors and more.
      expect(coreFitForRect(size.width, size.depth).floorCap, size.id).toBeGreaterThanOrEqual(2);
    }
    // Three-bay lots for the rich families, a five-bay square for corporate sectors and for
    // Interior's composed floors, which need 26 m each way.
    expect(STANDARD_LOT_SIZES.some((size) => Math.min(size.width, size.depth) >= 24)).toBe(true);
    expect(STANDARD_LOT_SIZES.some((size) => Math.min(size.width, size.depth) >= 40)).toBe(true);
    if (!existsSync(KIT_REQUEST)) return;
    const lot = JSON.parse(readFileSync(KIT_REQUEST, 'utf8')).properties.lot.properties;
    for (const size of STANDARD_LOT_SIZES) {
      for (const [side, value] of [['width', size.width], ['depth', size.depth]] as const) {
        expect(value, `${size.id} ${side}`).toBeGreaterThanOrEqual(lot[side].minimum);
        expect(value % lot[side].multipleOf, `${size.id} ${side}`).toBe(0);
      }
    }
  });
});
