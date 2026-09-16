import { resolveStreetDesign } from './Design';
import type { StreetDesign } from './schema/design';

/** Four metres of panels, an inner separator, then independently reserved curb and gutter. */
export function districtStreetDesign(): StreetDesign {
  return {
    moduleFormat: 'district',
    profiles: resolveStreetDesign().profiles,
    sidewalkProfiles: [{ id: 'district', curb: 0.2, border: 1, furnishing: 1, walking: 2, frontage: 0.2,
      edge: { curbRise: 0.2, gutter: { width: 0.5, lip: { width: 0.02, height: 0.02, side: 'road' } } } }],
  };
}
