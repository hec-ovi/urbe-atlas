import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { area, bounds, cell, local, outline } from './Geometry';
import type { GroundConstruction, PavingFrame, PavingModule } from './schema';

export interface FittedCells {
  polygon: Polygon;
  part: Extract<GroundConstruction['part'], { kind: 'grid' }>;
}

interface Span { row: number; from: number; to: number }

export class Cells {
  static select(boundaries: Polygon[], frame: PavingFrame, module: PavingModule, covers: (polygon: Polygon) => boolean,
    accepts: (column: number, row: number) => boolean = () => true, baseOffset: Vec2 = [0, 0]): FittedCells[] {
    const spans: Span[] = [];
    const visited = new Set<string>();
    for (const piece of boundaries) {
      const extent = bounds([piece.map(point => local(frame, point))]);
      const offsetU = baseOffset[0] * module.pitch[0] / (module.baseCells?.[0] ?? 1);
      const offsetV = baseOffset[1] * module.pitch[1] / (module.baseCells?.[1] ?? 1);
      const from = Math.floor((extent.min[0] - offsetU) / module.pitch[0]);
      const to = Math.ceil((extent.max[0] - offsetU) / module.pitch[0]);
      const bottom = Math.floor((extent.min[1] - offsetV) / module.pitch[1]);
      const top = Math.ceil((extent.max[1] - offsetV) / module.pitch[1]);
      for (let row = bottom; row < top; row++) {
        let start: number | undefined;
        for (let column = from; column < to; column++) {
          const footprint = cell(frame, module, column, row, baseOffset);
          const key = `${column}:${row}`;
          const fits = !visited.has(key) && accepts(column, row) && area(footprint) > 0 && covers(footprint);
          visited.add(key);
          if (fits && start === undefined) start = column;
          if ((!fits || column === to - 1) && start !== undefined) {
            spans.push({ row, from: start, to: fits ? column + 1 : column });
            start = undefined;
          }
        }
      }
    }
    spans.sort((a, b) => a.row - b.row || a.from - b.from);
    const groups: Span[][] = [];
    const active = new Map<string, Span[]>();
    for (const span of spans) {
      const key = `${span.from}:${span.to}`;
      const group = active.get(key);
      if (group && group[group.length - 1].row === span.row - 1) group.push(span);
      else {
        const next = [span];
        active.set(key, next);
        groups.push(next);
      }
    }
    return groups.map(cells => ({
      polygon: outline(frame, module, cells[0].from, cells[0].to, cells[0].row, cells[cells.length - 1].row + 1, baseOffset),
      part: { kind: 'grid', moduleId: module.id, cells,
        ...(baseOffset.some(value => value !== 0) ? { baseOffset: [...baseOffset] } : {}) },
    }));
  }

}
