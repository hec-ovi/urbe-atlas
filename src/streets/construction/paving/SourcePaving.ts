import type { GroundSurface, Polygon } from '../../../../schema/blueprint';
import { offset } from '../../../geom/clip';
import type { SourcePartition } from '../../../geom/partition/SourcePartition';
import type { PartitionClaim, PartitionEncoding } from '../../../geom/partition/schema';
import { Cells } from './Cells';
import { acceptsGroup, groupBaseOffset } from './Grouping';
import { bounds, overlaps, type Bounds } from './Geometry';
import { Ownership, type Field } from './Ownership';
import { Regions } from './Regions';
import { ResidualJoints } from './ResidualJoints';
import type { GroundMetadata } from './Publication';
import type { GroundConstruction, PavingRole } from './schema';

export interface LayoutDistrict { layoutId: string; polygons: Polygon[]; bounds: Bounds }

export class SourcePaving {
  private readonly metadata = new Map<string, GroundConstruction>();
  private sequence = 0;

  constructor(private readonly partition: SourcePartition, private readonly ownerId: string,
    private readonly source: Pick<GroundSurface, 'surface' | 'bottom' | 'top'>, private readonly sourceId: string,
    private readonly ownership: Ownership, private readonly regions: Regions,
    private readonly defaultLayoutId: string, private readonly districts: LayoutDistrict[],
    private readonly authored: boolean) {}

  refine(): Map<string, GroundMetadata> {
    const extent = bounds(this.partition.boundaries(this.ownerId));
    const fields = this.ownership.fields.filter(field => overlaps(extent, field.bounds)
      && (field.band === 'circulation' || (this.source.surface === 'curb') === (field.band === 'curb')));
    const claims = fields.map(field => ({ id: this.id(), field }));
    const remainderId = this.id();
    this.partition.divide(this.ownerId, { claims: claims.map(claim => this.claim(claim.id, claim.field)), remainderId });
    for (const claim of claims) this.field(claim.id, claim.field);
    for (const component of this.partition.components(remainderId)) {
      this.layout(component.id, this.ownership.residual(component.boundaries.flat()));
    }
    return new Map([...this.metadata].map(([id, construction]) => [id, { ...this.source, construction }]));
  }

  private field(ownerId: string, field: Field): void {
    for (const component of this.partition.components(ownerId)) {
      if (!field.tangents) {
        this.layout(component.id, field);
        continue;
      }
      const extent = bounds(component.boundaries);
      const claims = field.tangents.filter(tangent => overlaps(extent, tangent.bounds)).map(tangent => ({ id: this.id(), field: tangent }));
      const remainderId = this.id();
      this.partition.divide(component.id, { claims: claims.map(claim => this.claim(claim.id, claim.field)), remainderId });
      for (const claim of claims) this.field(claim.id, claim.field);
      this.layout(remainderId, field);
    }
  }

  private layout(ownerId: string, field: Field): void {
    const extent = bounds(this.partition.boundaries(ownerId));
    const claims = this.districts.filter(district => overlaps(extent, district.bounds)).map(district => ({ id: this.id(), district }));
    if (!claims.length) {
      this.fit(ownerId, field, this.defaultLayoutId);
      return;
    }
    const remainderId = this.id();
    this.partition.divide(ownerId, { claims: claims.map(claim => ({ id: claim.id, masks: claim.district.polygons,
      encoding: this.encoding('authored-1mm') })), remainderId });
    for (const claim of claims) this.fit(claim.id, field, claim.district.layoutId);
    this.fit(remainderId, field, this.defaultLayoutId);
  }

  private fit(ownerId: string, field: Field, layoutId: string): void {
    for (const component of this.partition.components(ownerId)) {
      const { region, frame, module, grouping, borderWidth } = this.regions.resolve(this.source, this.sourceId, field, layoutId);
      const role = (fallback: PavingRole): PavingRole => region.band === 'curb' || region.band === 'border' ? region.band : fallback;
      if (!field.fit) {
        this.solid(component.id, region.id, role(field.role));
        continue;
      }
      let coreId = component.id;
      if (borderWidth > 0) {
        coreId = this.id();
        const borderId = this.id();
        const masks = offset(this.partition.loops(component.id), -borderWidth);
        this.partition.divide(component.id, { claims: [{ id: coreId, masks, encoding: this.encoding('authored-1mm') }], remainderId: borderId });
        this.solid(borderId, region.id, role('border'));
      }
      this.solid(coreId, region.id, role('corner-infill'));
      const candidates = grouping ? [grouping.module, module] : [module];
      for (const candidate of candidates) {
        const accepts = grouping && candidate === grouping.module
          ? (column: number, row: number) => acceptsGroup(candidate, grouping.setting, column, row) : undefined;
        const cells = Cells.select(this.partition.boundaries(coreId), frame, candidate,
          polygon => this.partition.covers(coreId, polygon, { encoding: this.encoding('authored-1mm') }), accepts,
          grouping && candidate === grouping.module ? groupBaseOffset(candidate, grouping.setting) : undefined);
        for (const cell of cells) {
          const id = this.id();
          this.partition.reserve(coreId, { id, polygon: cell.polygon, encoding: this.encoding('authored-1mm') });
          this.metadata.set(id, { regionId: region.id, part: cell.part });
          if (cell.part.baseOffset) this.regions.construction.version = '1.2.0';
        }
      }
      if (region.band === 'curb') {
        const claims = ResidualJoints.claims(this.partition.boundaries(coreId), frame, module, () => this.id());
        if (claims.length) {
          const remainderId = this.id();
          this.partition.divide(coreId, { claims, remainderId });
          for (const claim of claims) this.solid(claim.id, region.id, 'joint');
          this.solid(remainderId, region.id, 'curb');
        }
      }
    }
  }

  private solid(ownerId: string, regionId: string, role: PavingRole): void {
    this.metadata.set(ownerId, { regionId, part: { kind: 'solid', role } });
  }

  private encoding(encoding: PartitionEncoding): PartitionEncoding { return this.authored ? encoding : 'binary'; }

  private claim(id: string, field: Field): PartitionClaim {
    const edgeMasks = this.authored ? field.edgeMasks : undefined;
    return { id, masks: edgeMasks ? [] : field.polygons, encoding: this.encoding(field.encoding),
      ...(edgeMasks ? { edgeMasks } : {}) };
  }

  private id(): string { return `paving:${this.sourceId}:${this.sequence++}`; }
}
