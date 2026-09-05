import type { AtlasParams } from '../../schema/params';

export const regularCityParams: AtlasParams = {
  seed: 'urbe-tiny', size: { width: 400, depth: 400 }, irregularity: 0,
  footprintShape: 'rectangle', districtCount: [1, 1], maxFloors: 6,
  features: { highways: false, trains: false, subways: false, alleys: false },
  streetDesign: {
    profiles: [
      { id: 'local', classes: ['street'], lanes: [
        { direction: 'backward', width: 3.5 }, { direction: 'forward', width: 3.5 },
      ], shoulders: { left: 0, right: 0 } },
      { id: 'avenue', classes: ['road'], lanes: [
        { direction: 'backward', width: 3.5 }, { direction: 'backward', width: 3.5 },
        { direction: 'forward', width: 3.5 }, { direction: 'forward', width: 3.5 },
      ], shoulders: { left: 0, right: 0 } },
    ],
    sidewalkProfiles: [
      { id: 'compact', curb: 0.15, border: 0.35, furnishing: 0.5, walking: 1.5, frontage: 0.5 },
      { id: 'standard', curb: 0.15, border: 0.35, furnishing: 1, walking: 2.5, frontage: 0.5 },
      { id: 'broad', curb: 0.15, border: 0.35, furnishing: 1.5, walking: 3.5, frontage: 1 },
      { id: 'promenade', curb: 0.15, border: 0.35, furnishing: 2, walking: 4.5, frontage: 1.5 },
    ],
    crossings: { pedestrianClearance: 2.5 },
  },
};
