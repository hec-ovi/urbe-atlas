/** Street dimension defaults, meters (NACTO / Seattle Streets Illustrated ranges). */
import type { StreetClass } from '../../schema/blueprint';
import type { DistrictKind } from '../../schema/params';

export function carriagewayWidth(cls: StreetClass): number {
  switch (cls) {
    case 'highway':
      return 15;
    case 'road':
      return 10;
    case 'street':
      return 7;
  }
}

/** Per-side sidewalk width; wider in dense centers, none on highways. */
export function sidewalkWidth(cls: StreetClass, district: DistrictKind | undefined): number {
  if (cls === 'highway') return 0;
  const wide = district === 'downtown' || district === 'commercial';
  if (cls === 'road') return wide ? 3.2 : 2.4;
  return wide ? 2.8 : district === 'industrial' ? 2.0 : 1.8;
}
