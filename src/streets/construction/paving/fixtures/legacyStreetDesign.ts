import { resolveStreetDesign } from '../../Design';
import type { SidewalkBands, StreetDesign } from '../../schema/design';

/** Explicit dimensions for the saved curb-only paving format. */
export function legacyStreetDesign(bands: SidewalkBands = {
  curb: 0.15, border: 0.35, furnishing: 1.5, walking: 3.5, frontage: 1,
}): StreetDesign {
  return resolveStreetDesign({
    profiles: [
      { id: 'local', classes: ['street'], lanes: [
        { direction: 'backward', width: 3.5 }, { direction: 'forward', width: 3.5 },
      ], shoulders: { left: 0, right: 0 } },
      { id: 'avenue', classes: ['road'], lanes: [
        { direction: 'backward', width: 3.5 }, { direction: 'backward', width: 3.5 },
        { direction: 'forward', width: 3.5 }, { direction: 'forward', width: 3.5 },
      ], shoulders: { left: 0, right: 0 } },
    ],
    sidewalkProfiles: [{ id: 'fitted', ...bands }],
  });
}
