/** Every ordinary parcel is exactly one published lot size; the rest are flagged landmarks. */
import type { CityBlueprint } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { STANDARD_LOT_SIZES, StandardLots } from '../blocks/StandardLots';

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
  // A city with fewer blocks than the floor cannot host ten distinct landmark plots.
  const ceiling = Math.min(30, Math.floor(bp.blocks.length / 4));
  if (landmarks > ceiling) throw invariantFailure(`city has ${landmarks} landmark parcels, over the ${ceiling} its blocks allow`);
}
