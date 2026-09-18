/**
 * Every ordinary parcel is exactly one published lot size, the rest are flagged
 * landmarks, and a block that names a template carries exactly that template's
 * lots, so two blocks of the same size and zone are the same block.
 */
import type { CityBlueprint } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { STANDARD_LOT_SIZES, StandardLots } from '../blocks/StandardLots';
import { bounds } from '../geom/polygon';

export function checkStandardLots(bp: CityBlueprint): void {
  const published = bp.meta.lotSizes;
  if (!published || published.length !== STANDARD_LOT_SIZES.length
    || published.some((size, index) => size.id !== STANDARD_LOT_SIZES[index].id
      || size.width !== STANDARD_LOT_SIZES[index].width || size.depth !== STANDARD_LOT_SIZES[index].depth
      || size.area !== size.width * size.depth)) {
    throw invariantFailure('meta.lotSizes differs from the standard lot catalog');
  }
  let landmarks = 0;
  for (const parcel of bp.parcels) {
    if (parcel.landmark) {
      if (parcel.lotSize) throw invariantFailure(`parcel ${parcel.id} is both a landmark and a standard lot`);
      landmarks++;
      continue;
    }
    const size = StandardLots.sizeOf(parcel.lot);
    if (!size || size.id !== parcel.lotSize) {
      throw invariantFailure(`parcel ${parcel.id} lot is not its published standard size`,
        { lotSize: parcel.lotSize ?? null, measured: size?.id ?? null });
    }
  }
  checkBlockTemplates(bp);
  // A city with fewer blocks than the floor cannot host ten distinct landmark plots.
  const ceiling = Math.min(30, Math.floor(bp.blocks.length / 4));
  if (landmarks > ceiling) throw invariantFailure(`city has ${landmarks} landmark parcels, over the ${ceiling} its blocks allow`);
}

function checkBlockTemplates(bp: CityBlueprint): void {
  const templates = new Map((bp.meta.blockTemplates ?? []).map(template => [template.id, template]));
  if (templates.size !== (bp.meta.blockTemplates ?? []).length) throw invariantFailure('meta.blockTemplates repeats an id');
  const lotById = new Map(bp.parcels.map(parcel => [parcel.id, parcel]));
  for (const block of bp.blocks) {
    if (!block.template) continue;
    const template = templates.get(block.template);
    if (!template) throw invariantFailure(`block ${block.id} names the unknown template ${block.template}`);
    const origin = bounds(block.boundary).min;
    const lots = block.parcelIds.map(id => lotById.get(id)!).map(parcel => bounds(parcel.lot));
    if (lots.length !== template.lots.length) {
      throw invariantFailure(`block ${block.id} has ${lots.length} lots, not the ${template.lots.length} of its template`);
    }
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    template.lots.forEach((lot, index) => {
      const measured = lots[index];
      if (!near(measured.min[0] - origin[0], lot.offset[0]) || !near(measured.min[1] - origin[1], lot.offset[1])
        || !near(measured.max[0] - measured.min[0], lot.width) || !near(measured.max[1] - measured.min[1], lot.depth)) {
        throw invariantFailure(`block ${block.id} lot ${index} differs from its template ${template.id}`, { lot, measured });
      }
    });
  }
}
