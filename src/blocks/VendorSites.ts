/**
 * Vendor sites: the small public businesses of a city, 2 to 4 m cabins where
 * people work, standing on open block land so they never narrow a sidewalk.
 *
 * Every park parcel carries one, as the pavilion of a square or the stall on
 * an empty lot. Every station forecourt carries one beside its entrance bay, a
 * 24/7 counter first. A yard that opens onto a street through a block's gate
 * carries one at the gate's mouth, against the neighbouring lot, on a seeded
 * share that follows the zone: busier in downtown and commercial districts,
 * quieter in residential and industrial ones. Each site names what it sells and
 * the posts the simulation staffs, shaped like Interior's capacity posts.
 */
import type { BlockYard, Polygon, Vec2, VendorKind, VendorPost, VendorSetting, VendorSite } from '../../schema/blueprint';
import type { DistrictKind } from '../../schema/params';
import { Rng } from '../core/rng';
import { area, bounds } from '../geom/polygon';
import { intersection } from '../geom/clip';
import { dist } from '../geom/vec';

/** Cabin frontage along the street and depth back from it, metres, on the half-metre grid. */
export const CABINS: Record<VendorKind, { frontage: number; depth: number }> = {
  food: { frontage: 3, depth: 2.5 },
  repair: { frontage: 2.5, depth: 2 },
  convenience: { frontage: 4, depth: 3 },
  bar: { frontage: 4, depth: 2.5 },
};

/** The staff each kind keeps on duty, and the shifts it opens. */
export const VENDOR_POSTS: Record<VendorKind, VendorPost[]> = {
  food: [{ role: 'cook', posts: 1, shifts: ['day', 'evening'] }, { role: 'vendor', posts: 1, shifts: ['day', 'evening'] }],
  repair: [{ role: 'vendor', posts: 1, shifts: ['day'] }],
  convenience: [{ role: 'vendor', posts: 1, shifts: ['day', 'evening', 'night'] }],
  bar: [{ role: 'waiter', posts: 1, shifts: ['evening', 'night'] }, { role: 'vendor', posts: 1, shifts: ['evening', 'night'] }],
};

/** Share of gate yards that keep a stall, by zone. */
const GATE_SHARE: Record<DistrictKind, number> = {
  downtown: 0.5, commercial: 0.45, mixed: 0.4, residential: 0.3, industrial: 0.25,
};

/** What a stall sells, weighted by zone. */
const ZONE_KINDS: Record<DistrictKind, Record<VendorKind, number>> = {
  downtown: { food: 3, repair: 1, convenience: 2, bar: 3 },
  commercial: { food: 3, repair: 1, convenience: 2, bar: 2 },
  mixed: { food: 3, repair: 2, convenience: 2, bar: 2 },
  residential: { food: 3, repair: 2, convenience: 2, bar: 1 },
  industrial: { food: 3, repair: 3, convenience: 1, bar: 1 },
};

const KINDS: VendorKind[] = ['food', 'repair', 'convenience', 'bar'];
/** A station entrance this close is the one a site serves, metres. */
export const STATION_REACH = 60;
/** Clear ground a gate keeps beside its stall, metres. */
const GATE_PASSAGE = 4;
const EPS = 1e-6;
const GRID = 0.5;

/** Outward normal of each side of a block or lot: south, east, north, west. */
const NORMALS: Vec2[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

interface Box { x0: number; z0: number; x1: number; z1: number }

export interface VendorBlock {
  id: string;
  districtId: string;
  zone: DistrictKind;
  /** The buildable rectangle inside the sidewalk ring. */
  interior: Polygon;
  /** Street edges on the block's four sides: south, east, north, west; null on a side no pedestrian street fronts. */
  sides: readonly (string | null)[];
  yards: readonly BlockYard[];
}

export interface VendorPark {
  parcelId: string;
  blockId: string;
  /** A public square, as opposed to a lot that could carry no building. */
  square: boolean;
  lot: Polygon;
  access: { edgeId: string; point: Vec2 };
}

export interface VendorInput {
  seed: string;
  blocks: readonly VendorBlock[];
  parks: readonly VendorPark[];
  stations: readonly { id: string; entrances: readonly Vec2[] }[];
  /** Junctions of three or more grade streets. */
  crossings: readonly Vec2[];
  /** Edges that are avenues (`road`). */
  avenues: ReadonlySet<string>;
}

const boxOf = (polygon: Polygon): Box => {
  const b = bounds(polygon);
  return { x0: b.min[0], z0: b.min[1], x1: b.max[0], z1: b.max[1] };
};
const ring = ({ x0, z0, x1, z1 }: Box): Polygon => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const r3 = (value: number): number => Math.round(value * 1000) / 1000;
const up = (value: number): number => r3(Math.ceil(value / GRID - EPS) * GRID);
const down = (value: number): number => r3(Math.floor(value / GRID + EPS) * GRID);

/** Sides of `box` that lie on the outline of `land`, in side order. */
function frontSides(box: Box, land: Box): number[] {
  return [Math.abs(box.z0 - land.z0) <= EPS, Math.abs(box.x1 - land.x1) <= EPS,
    Math.abs(box.z1 - land.z1) <= EPS, Math.abs(box.x0 - land.x0) <= EPS]
    .flatMap((on, side) => (on ? [side] : []));
}

/** The two ends of side `side` of `box`. */
function sideEnds(box: Box, side: number): [Vec2, Vec2] {
  switch (side) {
    case 0: return [[box.x0, box.z0], [box.x1, box.z0]];
    case 1: return [[box.x1, box.z0], [box.x1, box.z1]];
    case 2: return [[box.x0, box.z1], [box.x1, box.z1]];
    default: return [[box.x0, box.z0], [box.x0, box.z1]];
  }
}

/**
 * A cabin inside `box`, its counter on side `side` set back `front` metres
 * from it, `edge` metres from the chosen end of that side (`end` 0 the lower
 * coordinate, 1 the higher, 0.5 the middle). Corners land on the half-metre
 * grid inside the requested insets. Null when the box cannot hold it.
 */
export function placeCabin(box: Box, side: number, end: 0 | 0.5 | 1, kind: VendorKind, front: number, edge: number): Box | null {
  const { frontage, depth } = CABINS[kind];
  const alongX = side === 0 || side === 2;
  const [lo, hi] = alongX ? [box.x0, box.x1] : [box.z0, box.z1];
  let a0: number;
  if (end === 0) a0 = up(lo + edge);
  else if (end === 1) a0 = r3(down(hi - edge) - frontage);
  else a0 = up((lo + hi) / 2 - frontage / 2);
  const a1 = r3(a0 + frontage);
  let b0: number, b1: number;
  if (side === 0) { b0 = up(box.z0 + front); b1 = r3(b0 + depth); }
  else if (side === 2) { b1 = down(box.z1 - front); b0 = r3(b1 - depth); }
  else if (side === 3) { b0 = up(box.x0 + front); b1 = r3(b0 + depth); }
  else { b1 = down(box.x1 - front); b0 = r3(b1 - depth); }
  const cabin: Box = alongX ? { x0: a0, x1: a1, z0: b0, z1: b1 } : { x0: b0, x1: b1, z0: a0, z1: a1 };
  const inside = cabin.x0 >= box.x0 - EPS && cabin.x1 <= box.x1 + EPS && cabin.z0 >= box.z0 - EPS && cabin.z1 <= box.z1 + EPS;
  return inside ? cabin : null;
}

function counterOf(cabin: Box, side: number): Vec2 {
  const [a, b] = sideEnds(cabin, side);
  return [r3((a[0] + b[0]) / 2), r3((a[1] + b[1]) / 2)];
}

/** The whole cabin stands on `land`. */
function covers(land: Polygon, cabin: Box): boolean {
  const rect = ring(cabin);
  return Math.abs(intersection([rect], [land]).reduce((sum, piece) => sum + area(piece), 0) - area(rect)) < 1e-6;
}

const overlaps = (a: Box, b: Box): boolean =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > EPS && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > EPS;

export class VendorSites {
  static plan(input: VendorInput): VendorSite[] {
    const sites: VendorSite[] = [];
    const placed = new Map<string, Box[]>();
    const rng = Rng.from(input.seed, 'vendor-sites');
    const blockById = new Map(input.blocks.map(block => [block.id, block]));
    const entrances = input.stations.flatMap(station => station.entrances.map(point => ({ id: station.id, point })));
    const stationNear = (point: Vec2): { id: string; point: Vec2 } | undefined => entrances
      .map(entrance => ({ entrance, distance: dist(entrance.point, point) }))
      .filter(entry => entry.distance <= STATION_REACH)
      .sort((a, b) => a.distance - b.distance || a.entrance.id.localeCompare(b.entrance.id))[0]?.entrance;
    const nearestCrossing = (point: Vec2): Vec2 | undefined => [...input.crossings]
      .sort((a, b) => dist(a, point) - dist(b, point) || a[0] - b[0] || a[1] - b[1])[0];
    const add = (block: VendorBlock, cabin: Box, side: number, kind: VendorKind, setting: VendorSetting,
      extra: { parcelId?: string; yardId?: string; edgeId: string }): VendorSite | null => {
      const taken = placed.get(block.id) ?? [];
      if (taken.some(other => overlaps(other, cabin))) return null;
      taken.push(cabin);
      placed.set(block.id, taken);
      const counter = counterOf(cabin, side);
      const station = stationNear(counter);
      const site: VendorSite = {
        id: `v${sites.length}`, kind, setting, districtId: block.districtId, blockId: block.id,
        ...(extra.parcelId ? { parcelId: extra.parcelId } : {}), ...(extra.yardId ? { yardId: extra.yardId } : {}),
        footprint: ring(cabin), counter, facing: NORMALS[side], edgeId: extra.edgeId,
        ...(station ? { stationId: station.id } : {}),
        posts: VENDOR_POSTS[kind].map(post => ({ ...post, shifts: [...post.shifts] })),
      };
      sites.push(site);
      return site;
    };
    const pick = (zone: DistrictKind, stream: Rng): VendorKind => KINDS[stream.weighted(KINDS.map(kind => ZONE_KINDS[zone][kind]))];

    // Every park keeps its pavilion: a square's near its crossing, an empty lot's on its street front.
    for (const park of input.parks) {
      const block = blockById.get(park.blockId);
      if (!block) continue;
      const lot = boxOf(park.lot);
      const land = boxOf(block.interior);
      const fronts = frontSides(lot, land).filter(side => block.sides[side] !== null);
      // A lot reached from its door alone faces the side its door is nearest.
      const doorSide = [0, 1, 2, 3].map(side => {
        const [a, b] = sideEnds(lot, side);
        return { side, distance: dist([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], park.access.point) };
      }).sort((a, b) => a.distance - b.distance || a.side - b.side)[0].side;
      const accessSide = fronts.find(side => block.sides[side] === park.access.edgeId) ?? fronts[0] ?? doorSide;
      const streetOf = (side: number): string => block.sides[side] ?? park.access.edgeId;
      const stream = rng.fork(`park:${park.parcelId}`);
      let side = accessSide, end: 0 | 0.5 | 1 = 0.5, front = 1, edge = 1;
      let kind: VendorKind = park.square ? (block.zone === 'downtown' || block.zone === 'commercial' ? 'bar' : 'food')
        : (stream.chance(0.5) ? 'repair' : 'food');
      if (park.square) {
        // The pavilion faces the avenue when the square has one, at the end nearest its crossing.
        side = fronts.find(candidate => input.avenues.has(streetOf(candidate))) ?? accessSide;
        const [a, b] = sideEnds(lot, side);
        const crossing = nearestCrossing([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        end = crossing && dist(b, crossing) < dist(a, crossing) ? 1 : 0;
        front = 2;
        edge = 2;
        if (stationNear([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) kind = 'convenience';
      }
      // A lot too tight for the chosen cabin keeps the smallest one, in the middle of its front.
      let cabin = placeCabin(lot, side, end, kind, front, edge);
      if (!cabin) {
        kind = 'repair';
        cabin = placeCabin(lot, side, 0.5, kind, 0.5, 0.5);
      }
      if (!cabin) continue;
      add(block, cabin, side, kind, park.square ? 'square' : 'lot', { parcelId: park.parcelId, edgeId: streetOf(side) });
    }

    for (const block of input.blocks) {
      const land = boxOf(block.interior);
      for (const yard of block.yards) {
        if (yard.kind === 'strip' || !yard.streets.length) continue;
        const forecourt = yard.kind === 'forecourt';
        const stream = rng.fork(`yard:${yard.id}`);
        if (!forecourt && !stream.chance(GATE_SHARE[block.zone])) continue;
        // The mouth: the yard rectangle with the longest stretch on a street front.
        const mouths = yard.areas.flatMap(polygon => {
          const box = boxOf(polygon);
          return frontSides(box, land)
            .filter(side => block.sides[side] !== null)
            .map(side => {
              const [a, b] = sideEnds(box, side);
              return { polygon, box, side, length: dist(a, b), ends: [a, b] as [Vec2, Vec2] };
            });
        })
          .sort((a, b) => b.length - a.length || a.side - b.side || a.box.x0 - b.box.x0 || a.box.z0 - b.box.z0);
        let kind: VendorKind = forecourt ? 'convenience' : pick(block.zone, stream);
        for (const mouth of mouths) {
          const station = stationNear(mouth.ends[0]) ?? stationNear(mouth.ends[1]);
          if (forecourt && station && sites.some(site => site.stationId === station.id && site.kind === 'convenience')) kind = 'food';
          // A gate keeps its passage clear: the stall stands against the neighbouring lot.
          if (!forecourt && mouth.length < CABINS[kind].frontage + 1 + GATE_PASSAGE) continue;
          const target = station?.point ?? nearestCrossing(mouth.ends[0]);
          const end: 0 | 1 = target && dist(mouth.ends[1], target) < dist(mouth.ends[0], target) ? 1 : 0;
          const cabin = placeCabin(mouth.box, mouth.side, end, kind, 0.5, 0.5);
          // Water can cut a yard along its shoreline: the cabin stands on the yard's own ground.
          if (!cabin || !covers(mouth.polygon, cabin)) continue;
          if (add(block, cabin, mouth.side, kind, forecourt ? 'forecourt' : 'gate', { yardId: yard.id, edgeId: block.sides[mouth.side]! })) break;
        }
      }
    }
    return sites;
  }

  /** People a site keeps on duty at once, over every role. */
  static postCount(site: VendorSite): number {
    return site.posts.reduce((sum, post) => sum + post.posts, 0);
  }
}
