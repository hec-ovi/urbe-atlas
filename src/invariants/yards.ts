/**
 * Open land has a use and small businesses stand on it: every open rectangle of
 * a block belongs to exactly one yard, and every vendor site is a 2 to 4 m cabin
 * on the half-metre grid inside the yard or park lot it names, clear of every
 * other cabin, with staffed posts. A park's footprint is its pavilion's cabin.
 */
import type { CityBlueprint, Polygon } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { PAVILION_ENVELOPE } from '../zoning/envelopes';
import { bounds, distanceToOutline } from '../geom/polygon';
import { length, pointAt } from '../geom/polyline';
import { intersection } from '../geom/clip';
import { area } from '../geom/polygon';

const YARD_KINDS = new Set(['garden', 'court', 'yard', 'forecourt', 'strip']);
const VENDOR_KINDS = new Set(['food', 'repair', 'convenience', 'bar']);
const SETTINGS = new Set(['square', 'lot', 'gate', 'forecourt']);
const ROLES = new Set(['vendor', 'cook', 'waiter']);
const SHIFTS = new Set(['day', 'evening', 'night']);
const EPS = 1e-6;

const key = (ring: Polygon): string => ring.map(([x, z]) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`).sort().join(';');
const onGrid = (value: number): boolean => Math.abs(value * 2 - Math.round(value * 2)) < 1e-6;

/** The rectangle lies inside `land`, whole. */
function inside(rect: Polygon, land: Polygon): boolean {
  return Math.abs(intersection([rect], [land]).reduce((sum, piece) => sum + area(piece), 0) - area(rect)) < 1e-6;
}

export function checkYardsAndVendors(bp: CityBlueprint): void {
  const edgeById = new Map(bp.streets.edges.map(edge => [edge.id, edge]));
  /** The street runs along a side of the block: its middle stands one half-carriageway and a kerb from the block. */
  const fronts = (edgeId: string, boundary: Polygon): boolean => {
    const edge = edgeById.get(edgeId);
    if (!edge) return false;
    const middle = pointAt(edge.path, length(edge.path) / 2);
    return distanceToOutline(middle, boundary) <= edge.width / 2 + 2;
  };
  const yardIds = new Set<string>();
  const yardById = new Map<string, { blockId: string; areas: Polygon[] }>();
  for (const block of bp.blocks) {
    if (!block.yards) continue;
    const open = new Map(block.openAreas.map(ring => [key(ring), 0]));
    for (const yard of block.yards) {
      if (!/^y\d+$/.test(yard.id) || yardIds.has(yard.id)) throw invariantFailure(`block ${block.id} yard id ${yard.id} is not a unique y id`);
      yardIds.add(yard.id);
      yardById.set(yard.id, { blockId: block.id, areas: yard.areas });
      if (!YARD_KINDS.has(yard.kind)) throw invariantFailure(`yard ${yard.id} has the unknown kind ${yard.kind}`);
      if (!yard.areas.length) throw invariantFailure(`yard ${yard.id} has no ground`);
      for (const ring of yard.areas) {
        const k = key(ring);
        if (!open.has(k)) throw invariantFailure(`yard ${yard.id} names ground that is no open area of block ${block.id}`);
        open.set(k, open.get(k)! + 1);
      }
      if (yard.streets.some(edgeId => !fronts(edgeId, block.boundary))) {
        throw invariantFailure(`yard ${yard.id} opens onto a street that does not front block ${block.id}`);
      }
    }
    for (const [ring, count] of open) {
      if (count !== 1) throw invariantFailure(`block ${block.id} open area belongs to ${count} yards`, { ring });
    }
  }

  const sites = bp.vendorSites ?? [];
  const blockById = new Map(bp.blocks.map(block => [block.id, block]));
  const parcelById = new Map(bp.parcels.map(parcel => [parcel.id, parcel]));
  const pavilionOf = new Map<string, Polygon>();
  const seen = new Set<string>();
  const cabins: { id: string; box: ReturnType<typeof bounds> }[] = [];
  for (const site of sites) {
    if (!/^v\d+$/.test(site.id) || seen.has(site.id)) throw invariantFailure(`vendor site id ${site.id} is not a unique v id`);
    seen.add(site.id);
    if (!VENDOR_KINDS.has(site.kind) || !SETTINGS.has(site.setting)) throw invariantFailure(`vendor site ${site.id} has an unknown kind or setting`);
    const block = blockById.get(site.blockId);
    if (!block || block.districtId !== site.districtId) throw invariantFailure(`vendor site ${site.id} names the wrong block or district`);
    if (!fronts(site.edgeId, block.boundary)) throw invariantFailure(`vendor site ${site.id} serves a street that does not front its block`);
    const ring = site.footprint;
    const box = bounds(ring);
    const sides = [box.max[0] - box.min[0], box.max[1] - box.min[1]];
    if (ring.length !== 4 || Math.abs(area(ring) - sides[0] * sides[1]) > 1e-6
      || sides.some(side => side < 2 - EPS || side > 4 + EPS) || ring.some(([x, z]) => !onGrid(x) || !onGrid(z))) {
      throw invariantFailure(`vendor site ${site.id} cabin is not a 2 to 4 m rectangle on the half-metre grid`, { footprint: ring });
    }
    if (Math.abs(Math.hypot(site.facing[0], site.facing[1]) - 1) > 1e-9 || Math.abs(site.facing[0] * site.facing[1]) > 1e-9) {
      throw invariantFailure(`vendor site ${site.id} faces no street axis`);
    }
    const front = site.facing[0] > 0 ? box.max[0] - site.counter[0] : site.facing[0] < 0 ? site.counter[0] - box.min[0]
      : site.facing[1] > 0 ? box.max[1] - site.counter[1] : site.counter[1] - box.min[1];
    if (Math.abs(front) > 1e-3) throw invariantFailure(`vendor site ${site.id} counter is off its street side`);
    if (!site.posts.length || site.posts.some(post => !ROLES.has(post.role) || !(post.posts >= 1) || !post.shifts.length
      || post.shifts.some(shift => !SHIFTS.has(shift)))) {
      throw invariantFailure(`vendor site ${site.id} keeps no staffed post`);
    }
    if (site.setting === 'square' || site.setting === 'lot') {
      const parcel = site.parcelId ? parcelById.get(site.parcelId) : undefined;
      if (!parcel || parcel.type !== 'park' || parcel.blockId !== block.id || !inside(ring, parcel.lot)) {
        throw invariantFailure(`vendor site ${site.id} stands outside the park lot it names`);
      }
      pavilionOf.set(parcel.id, ring);
    } else {
      const yard = site.yardId ? yardById.get(site.yardId) : undefined;
      if (!yard || yard.blockId !== block.id || !yard.areas.some(land => inside(ring, land))) {
        throw invariantFailure(`vendor site ${site.id} stands outside the yard it names`);
      }
    }
    for (const other of cabins) {
      if (Math.min(box.max[0], other.box.max[0]) - Math.max(box.min[0], other.box.min[0]) > EPS
        && Math.min(box.max[1], other.box.max[1]) - Math.max(box.min[1], other.box.min[1]) > EPS) {
        throw invariantFailure(`vendor sites ${other.id} and ${site.id} overlap`);
      }
    }
    cabins.push({ id: site.id, box });
  }

  const volumes = new Set(bp.volumetric.buildings.map(building => building.parcelId));
  for (const parcel of bp.parcels) {
    if (parcel.type !== 'park' || !bp.vendorSites) continue;
    const cabin = pavilionOf.get(parcel.id);
    if (!cabin || !parcel.footprint || key(parcel.footprint) !== key(cabin)) {
      throw invariantFailure(`park ${parcel.id} footprint is not the pavilion of its vendor site`);
    }
    const envelope = parcel.envelope;
    if (!envelope || envelope.minFloors !== PAVILION_ENVELOPE.minFloors || envelope.maxFloors !== PAVILION_ENVELOPE.maxFloors
      || envelope.floorHeight !== PAVILION_ENVELOPE.floorHeight || envelope.maxHeight !== PAVILION_ENVELOPE.maxHeight) {
      throw invariantFailure(`park ${parcel.id} carries no pavilion envelope`);
    }
    if (!volumes.has(parcel.id)) throw invariantFailure(`park ${parcel.id} pavilion has no volumetric building`);
  }
}
