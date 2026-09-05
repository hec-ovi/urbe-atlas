import type { ParcelType } from '../../schema/blueprint';
import type { DistrictKind } from '../../schema/params';

export const BASE_MIX: Record<DistrictKind, [ParcelType, number][]> = {
  downtown: [['offices', 0.42], ['corpo', 0.14], ['hotel', 0.12], ['commerce', 0.16], ['residential', 0.16]],
  commercial: [['commerce', 0.42], ['offices', 0.26], ['hotel', 0.08], ['residential', 0.24]],
  residential: [['residential', 0.86], ['commerce', 0.14]],
  industrial: [['factory', 0.82], ['commerce', 0.08], ['offices', 0.10]],
  mixed: [['residential', 0.52], ['offices', 0.18], ['commerce', 0.30]],
};
