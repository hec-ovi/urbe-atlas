/**
 * Standard lot sizes and the tiler that lays them.
 *
 * A block is a rectangle, and its buildable land is filled with rows of
 * standard rectangles: every ordinary parcel is exactly one catalog size, so a
 * downstream building kit built for that size fits it without stretching. What
 * a row cannot fill stays open area. Selected runs of neighbouring cells merge
 * into one landmark lot, the only lot shape outside the catalog.
 *
 * The tiling is keyed by block width, depth and zone, never by block id or
 * position, so two blocks of the same size and zone carry the same template id
 * and the same lots and a consumer builds the tiling once.
 */
import type { BlockTemplate, BlockTemplateLot, Polygon, Vec2 } from '../../schema/blueprint';
import type { DistrictKind } from '../../schema/params';
import type { StandardLotSize } from '../../schema/blueprint';
import { Rng } from '../core/rng';
import { area } from '../geom/polygon';

/**
 * Six sizes, every dimension a multiple of the 8 m module so rows and row
 * depths pack with at most 7 m left over. Widths are street frontages, depths
 * run back from the street. They cover 512 m2 shopfronts and row houses up to
 * 3136 m2 commercial and industrial plots.
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

/** Land below this is a sliver, not an open area worth publishing. */
const SLIVER = 1;

export interface StandardLotCell {
  polygon: Polygon;
  sizeId: string;
  /** Row index across the block, and position along that row. */
  row: number;
  index: number;
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

/** One rectangle of a template, in block-local coordinates. */
interface LocalRectangle {
  offset: Vec2;
  width: number;
  depth: number;
}

/** A template plus the local rows and leftovers the generator places. */
export interface BlockTemplatePlan extends BlockTemplate {
  /** Row and position along it, per published lot. */
  rows: { row: number; index: number }[];
  /** Land no row claims, as block-local rectangles. */
  openAreas: LocalRectangle[];
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

/** A block as the tiler sees it: its published rectangle and the land inside its sidewalk ring. */
export interface BlockShape {
  /** Minimum corner of the block rectangle: every template offset starts here. */
  origin: Vec2;
  width: number;
  depth: number;
  /** Minimum corner of the buildable land, and its size. */
  interior: { offset: Vec2; width: number; depth: number };
}

/** The tilings a city uses, one per block size and zone. */
export class BlockTemplates {
  private readonly plans = new Map<string, BlockTemplatePlan>();
  private readonly ids = new Set<string>();

  constructor(private readonly seed: string) {}

  /** The tiling for a block of this size in this zone, built once and reused. */
  get(block: BlockShape, zone: DistrictKind): BlockTemplatePlan {
    const inside = block.interior;
    const key = [zone, round(block.width), round(block.depth), round(inside.offset[0]), round(inside.offset[1]),
      round(inside.width), round(inside.depth)].join(':');
    let plan = this.plans.get(key);
    if (!plan) {
      const base = `bt-${zone}-${round(block.width)}x${round(block.depth)}`;
      let id = base;
      for (let n = 2; this.ids.has(id); n++) id = `${base}-${n}`;
      this.ids.add(id);
      plan = tile(id, round(block.width), round(block.depth), zone,
        { offset: [round(inside.offset[0]), round(inside.offset[1])], width: round(inside.width), depth: round(inside.depth) },
        Rng.from(this.seed, 'block-templates').fork(key));
      this.plans.set(key, plan);
    }
    return plan;
  }

  /** Every template the city used, in id order. */
  published(): BlockTemplate[] {
    return [...this.plans.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id, width, depth, zone, lots }) => ({ id, width, depth, zone, lots: lots.map(lot => ({ ...lot })) }));
  }
}

/** Places a template's lots at a block's minimum corner. */
export function placeTemplate(plan: BlockTemplatePlan, origin: Vec2): StandardLotCell[] {
  return plan.lots.map((lot, index) => ({
    polygon: rectangle(origin[0] + lot.offset[0], origin[1] + lot.offset[1], lot.width, lot.depth),
    sizeId: lot.sizeId,
    ...plan.rows[index],
  }));
}

/** Places a template's leftovers at a block's minimum corner. */
export function placeOpenAreas(plan: BlockTemplatePlan, origin: Vec2): Polygon[] {
  return plan.openAreas
    .filter(piece => piece.width * piece.depth > SLIVER)
    .map(piece => rectangle(origin[0] + piece.offset[0], origin[1] + piece.offset[1], piece.width, piece.depth));
}

export class StandardLots {
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

  /** The catalog entry a lot polygon measures, in either orientation, or null for any other shape. */
  static sizeOf(lot: Polygon): StandardLotSize | null {
    const box = sidesOf(lot);
    const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    return box && STANDARD_LOT_SIZES.find(size => (same(size.width, box[0]) && same(size.depth, box[1]))
      || (same(size.width, box[1]) && same(size.depth, box[0]))) || null;
  }
}

/** Rows of catalog rectangles over one block's buildable rectangle, deterministic in size and zone alone. */
function tile(id: string, width: number, depth: number, zone: DistrictKind,
  inside: { offset: Vec2; width: number; depth: number }, rng: Rng): BlockTemplatePlan {
  const span = [inside.width, inside.depth];
  // Rows run along the longer side, so lots front the block's longer street faces.
  const along = inside.width >= inside.depth ? 0 : 1;
  const across = 1 - along;
  const sizes = STANDARD_LOT_SIZES.filter(size => KIND_WEIGHTS[zone][size.id] > 0);
  const rows = rowDepths(span[across], new Set(sizes.map(size => size.depth)));
  const lots: BlockTemplateLot[] = [];
  const placement: BlockTemplatePlan['rows'] = [];
  const openAreas: LocalRectangle[] = [];
  const at = (station: number, offset: number): Vec2 => (along === 0
    ? [round(inside.offset[0] + station), round(inside.offset[1] + offset)]
    : [round(inside.offset[0] + offset), round(inside.offset[1] + station)]);
  let offset = 0;
  rows.forEach((rowDepth, row) => {
    let station = 0;
    for (let index = 0; ; index++) {
      const remaining = span[along] - station;
      const fitting = sizes.filter(size => size.depth === rowDepth && size.width <= remaining);
      if (!fitting.length) break;
      const choice = fitting[rng.weighted(fitting.map(size => KIND_WEIGHTS[zone][size.id]))];
      lots.push({ offset: at(station, offset), ...sides(choice.width, rowDepth, along), sizeId: choice.id });
      placement.push({ row, index });
      station += choice.width;
    }
    if (station < span[along]) {
      openAreas.push({ offset: at(station, offset), ...sides(span[along] - station, rowDepth, along) });
    }
    offset += rowDepth;
  });
  if (offset < span[across]) openAreas.push({ offset: at(0, offset), ...sides(span[along], span[across] - offset, along) });
  return { id, width, depth, zone, lots, rows: placement, openAreas };
}

/** A cell's published width and depth: width is its frontage along the row. */
function sides(along: number, across: number, axis: 0 | 1): { width: number; depth: number } {
  return axis === 0 ? { width: along, depth: across } : { width: across, depth: along };
}

/** Lot corners land on the published millimetre grid. */
const rectangle = (x: number, z: number, width: number, depth: number): Polygon => {
  const [x0, z0, x1, z1] = [round(x), round(z), round(x + width), round(z + depth)];
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
};

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

/** Side lengths of an axis-aligned four-corner ring. */
function sidesOf(region: Polygon): [number, number] | null {
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
