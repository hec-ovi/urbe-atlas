import type { StreetDesign } from '../../schema/design';

/** Fixed source dimensions for datum format and compatibility tests. */
export const datumStreetDesign: StreetDesign = {
  profiles: [
    {
      id: 'local', classes: ['street'],
      lanes: [{ direction: 'backward', width: 3.5 }, { direction: 'forward', width: 3.5 }],
      shoulders: { left: 0, right: 0 },
    },
    {
      id: 'avenue', classes: ['road'],
      lanes: [
        { direction: 'backward', width: 3.5 }, { direction: 'backward', width: 3.5 },
        { direction: 'forward', width: 3.5 }, { direction: 'forward', width: 3.5 },
      ],
      shoulders: { left: 0, right: 0 },
    },
  ],
  sidewalkProfiles: [{ id: 'curb-only', curb: 0.15, border: 0, furnishing: 0.5, walking: 1.5, frontage: 0 }],
};
