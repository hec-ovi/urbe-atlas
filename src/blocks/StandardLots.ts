/**
 * Standard lot sizes and the tiler that lays them.
 *
 * A block's buildable land is filled with rows of standard rectangles: every
 * ordinary parcel is exactly one catalog size, so a downstream building kit
 * built for that size fits it without stretching. What a row cannot fill stays
 * open area. Selected runs of neighbouring cells merge into one landmark lot,
 * the only lot shape outside the catalog.
 */
import type { Polygon, Vec2 } from '../../schema/blueprint';
import type { DistrictKind } from '../../schema/params';
import type { StandardLotSize } from '../../schema/blueprint';
import type { Rng } from '../core/rng';
import { difference } from '../geom/clip';
import { area } from '../geom/polygon';

/**
 * Six sizes, every dimension a multiple of 8 m so rows and row depths pack with
 * at most 7 m left over. Widths are street frontages, depths run back from the
 * street. They cover what recursive subdivision produced before them: 512 m2
 * shopfronts and row houses up to 3136 m2 commercial and industrial plots.
 */
export const STANDARD_LOT_SIZES: readonly StandardLotSize[] = Object.freeze([
  { id: 'lot-16x32', width: 16, depth: 32, area: 512 },
  { id: 'lot-24x32', width: 24, depth: 32, area: 768 },
  { id: 'lot-24x40', width: 24, depth: 40, area: 960 },
  { id: 'lot-40x40', width: 40, depth: 40, area: 1600 },
  { id: 'lot-40x56', width: 40, depth: 56, area: 2240 },
  { id: 'lot-56x56', width: 56, depth: 56, area: 3136 },
].map(size => Object.freeze(size)) as StandardLotSize[]);

/** Row depths, deepest first. */
const DEPTHS: readonly number[] = [...new Set(STANDARD_LOT_SIZES.map(size => size.depth))].sort((a, b) => b - a);

/** Relative weight of each size per district kind; a zero-weight size never appears there. */
const KIND_WEIGHTS: Record<DistrictKind, Record<string, number>> = {
  downtown: { 'lot-16x32': 1, 'lot-24x32': 2, 'lot-24x40': 3, 'lot-40x40': 4, 'lot-40x56': 4, 'lot-56x56': 2 },
  commercial: { 'lot-16x32': 1, 'lot-24x32': 2, 'lot-24x40': 3, 'lot-40x40': 4, 'lot-40x56': 4, 'lot-56x56': 3 },
  residential: { 'lot-16x32': 4, 'lot-24x32': 4, 'lot-24x40': 3, 'lot-40x40': 2, 'lot-40x56': 1, 'lot-56x56': 1 },
  industrial: { 'lot-16x32': 0, 'lot-24x32': 0, 'lot-24x40': 1, 'lot-40x40': 2, 'lot-40x56': 4, 'lot-56x56': 5 },
  mixed: { 'lot-16x32': 3, 'lot-24x32': 4, 'lot-24x40': 4, 'lot-40x40': 3, 'lot-40x56': 2, 'lot-56x56': 1 },
};

/** Building-grid cell the lot corners land on, metres. */
const GRID = 0.5;
/** Station step used when no size fits at the current one, metres. */
const STEP = 8;
/** Land below this is a sliver, not an open area worth publishing. */
const SLIVER = 1;

export interface StandardLotCell {
  polygon: Polygon;
  sizeId: string;
  /** Row index across the block, and position along that row. */
  row: number;
  index: number;
}

export interface StandardLotPlan {
  cells: StandardLotCell[];
  openAreas: Polygon[];
}

export interface BlockCells {
  blockIndex: number;
  cells: StandardLotCell[];
}

export interface LandmarkLot {
  blockIndex: number;
  polygon: Polygon;
  /** Cells the landmark absorbed; they publish no ordinary parcel. */
  cells: StandardLotCell[];
}

const up = (value: number): number => Math.ceil(value / GRID - 1e-9) * GRID;
const down = (value: number): number => Math.floor(value / GRID + 1e-9) * GRID;

export class StandardLots {
  /** Lays standard rows over one buildable region. Land no row claims is returned as open area. */
  static plan(region: Polygon, kind: DistrictKind, rng: Rng): StandardLotPlan {
    const xs = region.map(point => point[0]), zs = region.map(point => point[1]);
    const span: [number, number][] = [[up(Math.min(...xs)), down(Math.max(...xs))], [up(Math.min(...zs)), down(Math.max(...zs))]];
    // Rows run along the longer side, so lots front the block's longer street faces.
    const along = span[0][1] - span[0][0] >= span[1][1] - span[1][0] ? 0 : 1;
    const across = 1 - along;
    const sizes = STANDARD_LOT_SIZES.filter(size => KIND_WEIGHTS[kind][size.id] > 0);
    const rows = rowDepths(span[across][1] - span[across][0], new Set(sizes.map(size => size.depth)));
    // A rectangular region contains every cell inside its inward-snapped span; anything else is clipped against.
    const whole = rectangleOf(region) !== null;

    const cells: StandardLotCell[] = [];
    let offset = span[across][0];
    rows.forEach((depth, row) => {
      const rowStart = offset;
      offset += depth;
      let station = span[along][0], index = 0;
      while (station < span[along][1]) {
        const remaining = span[along][1] - station;
        const fitting = sizes.filter(size => size.depth === depth && size.width <= remaining);
        const choice = fitting.length ? fitting[rng.weighted(fitting.map(size => KIND_WEIGHTS[kind][size.id]))] : undefined;
        const polygon = choice && cell(station, rowStart, choice.width, depth, along);
        if (polygon && (whole || difference([polygon], [region]).length === 0)) {
          cells.push({ polygon, sizeId: choice!.id, row, index: index++ });
          station += choice!.width;
        } else {
          station += STEP;
        }
      }
    });
    const claimed = cells.map(value => value.polygon);
    return { cells, openAreas: (claimed.length ? difference([region], claimed) : [region]).filter(piece => area(piece) > SLIVER) };
  }

  /**
   * One landmark lot in each of the city's chosen blocks: a run of neighbouring
   * cells merged into a single plot, outside the catalog and built bespoke.
   * The count is 10 to 30 where the city has the blocks for it, fewer below that.
   */
  static landmarks(blocks: readonly BlockCells[], rng: Rng): Map<number, LandmarkLot> {
    const candidates = blocks.flatMap(({ blockIndex, cells }) => {
      const found = bestRun(cells);
      return found ? [{ blockIndex, ...found }] : [];
    }).sort((a, b) => area(b.polygon) - area(a.polygon) || a.blockIndex - b.blockIndex);
    const target = Math.min(Math.max(Math.round(blocks.length / 10), 10), 30, Math.floor(blocks.length / 4));
    // The largest plots are the ones a hospital, a depot or a singular tower needs; the draw spreads them over the city.
    const pool = candidates.slice(0, target * 2);
    const order = pool.map((_, index) => index);
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [order[i], order[j]] = [order[j], order[i]];
    }
    return new Map(order.slice(0, target).sort((a, b) => a - b).map(index => [pool[index].blockIndex, pool[index]]));
  }

  /** The catalog entry a lot polygon matches exactly, in either orientation, or null for any other shape. */
  static sizeOf(lot: Polygon): StandardLotSize | null {
    const box = rectangleOf(lot);
    return box && STANDARD_LOT_SIZES.find(size => (size.width === box[0] && size.depth === box[1])
      || (size.width === box[1] && size.depth === box[0])) || null;
  }
}

/** Widest run of two or three touching cells in one row, the plot a landmark takes. */
function bestRun(cells: readonly StandardLotCell[]): { polygon: Polygon; cells: StandardLotCell[] } | null {
  const rows = new Map<number, StandardLotCell[]>();
  for (const value of cells) rows.set(value.row, [...(rows.get(value.row) ?? []), value]);
  let best: { polygon: Polygon; cells: StandardLotCell[] } | null = null;
  for (const row of rows.values()) {
    row.sort((a, b) => a.index - b.index);
    for (let start = 0; start + 1 < row.length; start++) {
      for (let count = 2; count <= 3 && start + count <= row.length; count++) {
        const run = row.slice(start, start + count);
        if (run.some((value, i) => i > 0 && value.index !== run[i - 1].index + 1)) break;
        const merged = touchingCells(run);
        if (!merged) break;
        if (!best || area(merged) > area(best.polygon)) best = { polygon: merged, cells: run };
      }
    }
  }
  return best;
}

/** The one rectangle a run of cells covers exactly, or null when they leave a gap. */
function touchingCells(run: readonly StandardLotCell[]): Polygon | null {
  const xs = run.flatMap(value => value.polygon.map(point => point[0]));
  const zs = run.flatMap(value => value.polygon.map(point => point[1]));
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const covered = run.reduce((sum, value) => sum + area(value.polygon), 0);
  if (Math.abs(covered - (x1 - x0) * (z1 - z0)) > 1e-6) return null;
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

/** Side lengths of an axis-aligned four-corner ring, the shape a block interior keeps unless water or infrastructure cut it. */
function rectangleOf(region: Polygon): [number, number] | null {
  if (region.length !== 4) return null;
  const xs = region.map(point => point[0]), zs = region.map(point => point[1]);
  const width = Math.max(...xs) - Math.min(...xs), depth = Math.max(...zs) - Math.min(...zs);
  return Math.abs(area(region) - width * depth) <= 1e-6 ? [width, depth] : null;
}

/** Deepest stack of standard row depths that fits across the block, deeper rows first. */
function rowDepths(across: number, available: ReadonlySet<number>): number[] {
  const depths = DEPTHS.filter(depth => available.has(depth));
  const rows: number[] = [];
  let left = across;
  for (;;) {
    const best = depths.filter(depth => depth <= left)
      .map(depth => ({ depth, total: depth + fill(left - depth, depths) }))
      .sort((a, b) => b.total - a.total || b.depth - a.depth)[0];
    if (!best) return rows;
    rows.push(best.depth);
    left -= best.depth;
  }
}

/** Largest total the depths can reach inside `left`, used to compare row choices. */
function fill(left: number, depths: readonly number[]): number {
  let best = 0;
  for (const depth of depths) {
    if (depth > left) continue;
    best = Math.max(best, depth + fill(left - depth, depths));
  }
  return best;
}

function cell(station: number, offset: number, width: number, depth: number, along: 0 | 1): Polygon {
  const at = (u: number, v: number): Vec2 => (along === 0 ? [station + u, offset + v] : [offset + v, station + u]);
  return along === 0
    ? [at(0, 0), at(width, 0), at(width, depth), at(0, depth)]
    : [at(0, 0), at(0, depth), at(width, depth), at(width, 0)];
}
