import { invariantFailure } from '../../errors';
import { overlay } from './Arrangement';
import { extent, overlaps } from './BoxIndex';
import { PointPool, type Point, type Region, type Ring } from './Exact';
import { readEdgeMask } from './EdgeMasks';
import { CoordinateEnclosures } from './CoordinateEnclosures';
import { connected, simple } from './Regions';
import { readRing } from './RingInput';
import { readPreparedMasks } from './PreparedMasks';
import { chain, nodeSegments, segments } from './Segments';
import { WindingField } from './WindingField';
import type { Division, PartitionComponent, PartitionCoordinates, PartitionInput, PartitionPointEnclosure, PartitionReservation, Polygon, SharedPartition } from './schema';

interface Owner {
  id: string;
  read: () => Region;
  children?: string[];
  fixed?: Ring;
  reservations: string[];
  components?: PartitionComponent[];
}

/** Exact boundaries stay inside this instance until its final shared publication. */
export class SourcePartition {
  static create(input: PartitionInput): SourcePartition { return new SourcePartition(input); }

  private readonly pool: PointPool;
  private readonly source: Ring;
  private readonly owners = new Map<string, Owner>();
  private readonly rootId: string;

  private constructor(input: PartitionInput) {
    this.pool = new PointPool(input.coordinateScale);
    this.source = readRing(input.source, this.pool);
    this.rootId = input.id;
    this.add(input.id, () => [this.source]);
  }

  divide(ownerId: string, input: Division): void {
    const owner = this.editable(ownerId);
    this.available([...input.claims.map(claim => claim.id), input.remainderId]);
    const source = this.remaining(owner), masks = input.claims.map(claim => {
      const reader = this.pool.reader(claim.encoding);
      const rings = [...claim.masks.map(mask => readRing(mask, reader)), ...(claim.edgeMasks ?? []).map(mask => readEdgeMask(mask, reader))];
      if (!claim.preparedMasks) return rings;
      const prepared = readPreparedMasks(claim.preparedMasks);
      return rings.length ? new WindingField([...prepared.rings, ...rings]) : prepared;
    });
    let regions: Region[] | undefined;
    const read = (index: number) => (regions ??= overlay(source, masks, this.pool))[index];
    const ids = [...input.claims.map(claim => claim.id), input.remainderId];
    ids.forEach((id, index) => this.add(id, () => read(index)));
    owner.children = [...owner.reservations, ...ids];
  }

  loops(ownerId: string): Polygon[] { return this.remaining(this.readable(ownerId)).map(ring => ring.map(point => [...point.value])); }
  boundaries(ownerId: string): Polygon[] { return simple(this.remaining(this.readable(ownerId)), this.pool).map(ring => ring.map(point => [...point.value])); }

  boundaryEnclosures(ownerId: string): PartitionPointEnclosure[][] {
    const bounds = new CoordinateEnclosures();
    return simple(this.remaining(this.readable(ownerId)), this.pool).map(ring => ring.map(point => bounds.point(point)));
  }

  components(ownerId: string): PartitionComponent[] {
    const owner = this.owner(ownerId);
    if (owner.components) return structuredClone(owner.components);
    this.editable(ownerId);
    const regions = connected(this.remaining(owner), this.pool);
    const ids = regions.map((_, index) => `${ownerId}:component:${index}`);
    this.available(ids);
    owner.components = regions.map((region, index) => {
      this.add(ids[index], () => region);
      return { id: ids[index], boundaries: simple(region, this.pool).map(ring => ring.map(point => [...point.value])) };
    });
    owner.children = [...owner.reservations, ...ids];
    return structuredClone(owner.components);
  }

  covers(ownerId: string, polygon: Polygon, input: PartitionCoordinates = {}): boolean {
    const owner = this.readable(ownerId), ring = readRing(polygon, this.pool.reader(input.encoding)), region = owner.read();
    if (overlay([ring], [region], this.pool)[1].length) return false;
    const box = extent([ring]);
    for (const id of owner.reservations) {
      const fixed = this.owner(id).fixed!;
      if (overlaps(box, extent([fixed])) && overlay([ring], [[fixed]], this.pool)[0].length) return false;
    }
    return true;
  }

  reserve(ownerId: string, input: PartitionReservation): void {
    const owner = this.editable(ownerId);
    this.available([input.id]);
    if (!this.covers(ownerId, input.polygon, input)) throw invariantFailure('partition reservation is not completely contained', { ownerId, id: input.id });
    const reader = this.pool.reader(input.encoding), ring = input.polygon.map(point => reader.input(point));
    const normalized = readRing(input.polygon, reader);
    if (ring.length !== normalized.length || ring.some((point, index) => point.key !== normalized[index].key)) {
      throw invariantFailure('partition reservation must be an unclosed CCW canonical ring', { id: input.id });
    }
    const fixed = this.add(input.id, () => [ring]); fixed.fixed = ring;
    owner.reservations.push(input.id);
  }

  finish(): SharedPartition {
    const published: { ownerId: string; fixed: boolean; ring: Ring }[] = [];
    const visit = (id: string) => {
      const owner = this.owner(id);
      if (owner.children) { owner.children.forEach(visit); return; }
      if (owner.fixed) { published.push({ ownerId: id, fixed: true, ring: owner.fixed }); return; }
      owner.reservations.forEach(visit);
      for (const ring of simple(this.remaining(owner), this.pool)) published.push({ ownerId: id, fixed: false, ring });
    };
    visit(this.rootId);
    const rings = [this.source, ...published.map(piece => piece.ring)], edges = segments(rings);
    nodeSegments(edges, this.pool);
    const points: Point[] = [], ids = new Map<string, number>();
    const index = (point: Point) => {
      let id = ids.get(point.key);
      if (id === undefined) { id = points.length; ids.set(point.key, id); points.push(point); }
      return id;
    };
    let cursor = 0;
    const paths = rings.map(ring => ring.map(() => chain(edges[cursor++])));
    const source = this.source.map(index), pieces = published.map((piece, position) => ({ ownerId: piece.ownerId, fixed: piece.fixed,
      vertices: (piece.fixed ? piece.ring : paths[position + 1].flatMap(path => path.slice(0, -1))).map(index) }));
    const sourceChains = paths[0].map(path => path.map(index));
    const pieceChains = pieces.map((piece, position) => piece.fixed ? paths[position + 1].map(path => path.map(index))
      : piece.vertices.map((vertex, next) => [vertex, piece.vertices[(next + 1) % piece.vertices.length]]));
    return { vertices: points.map(point => [...point.value]), pieces,
      certificate: { exactVertices: points.map(point => ({ x: String(point.x), y: String(point.y), w: String(point.w) })),
        source, sourceChains, pieceChains } };
  }

  private owner(id: string): Owner {
    const owner = this.owners.get(id);
    if (!owner) throw invariantFailure('partition owner is unknown', { id });
    return owner;
  }

  private editable(id: string): Owner {
    const owner = this.readable(id);
    if (owner.fixed) throw invariantFailure('partition owner is protected', { id });
    return owner;
  }

  private readable(id: string): Owner {
    const owner = this.owner(id);
    if (owner.children) throw invariantFailure('partition owner is already divided', { id });
    return owner;
  }

  private available(ids: string[]): void {
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id || seen.has(id) || this.owners.has(id)) throw invariantFailure('partition owner IDs must be unique and nonempty', { id });
      seen.add(id);
    }
  }

  private add(id: string, read: () => Region): Owner {
    this.available([id]);
    const owner = { id, read, reservations: [] }; this.owners.set(id, owner); return owner;
  }

  private remaining(owner: Owner): Region {
    if (!owner.reservations.length) return owner.read();
    return overlay(owner.read(), owner.reservations.map(id => [this.owner(id).fixed!]), this.pool).at(-1)!;
  }
}
