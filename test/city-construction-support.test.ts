import { expect, it } from 'vitest';
import type { AtlasParams, DistrictKind } from '../schema/params';
import { generateCity } from '../src';
import { CityConstructionSupport } from '../src/CityConstructionSupport';
import { resolveStreetDesign } from '../src/streets/construction/Design';

const legacy = { id: 'legacy', curb: 0.15, border: 0.2, furnishing: 0.5, walking: 2, frontage: 0.15 };

it('accepts resolved defaults and custom curb-only profiles without changing them', () => {
  for (const design of [resolveStreetDesign(), resolveStreetDesign({
    ...resolveStreetDesign(), sidewalkProfiles: [legacy],
  })]) {
    const saved = JSON.stringify(design);
    expect(CityConstructionSupport.assert(design)).toBeUndefined();
    expect(JSON.stringify(design)).toBe(saved);
  }
});

it.each(['modern', 'legacy'])('rejects explicit city construction when assignments select %s', selected => {
  const districts: DistrictKind[] = ['downtown', 'commercial', 'residential', 'industrial', 'mixed'];
  const input: AtlasParams = {
    seed: 'city-consumer-capability', size: { width: 400, depth: 400 },
    streetDesign: {
      ...resolveStreetDesign(), sidewalkProfiles: [legacy, {
        id: 'modern', curb: 0.2, border: 0, furnishing: 0.5, walking: 1.5, frontage: 0,
        edge: { curbRise: 0.2, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' } } },
      }],
      sidewalkAssignments: districts.map(district => ({ district, street: selected, road: selected })),
    },
  };
  const saved = JSON.stringify(input);
  expect(() => generateCity(input)).toThrowError(expect.objectContaining({
    code: 'E_INVALID_PARAMS', message: 'generateCity does not support explicit sidewalk edge geometry',
    details: { field: 'streetDesign.sidewalkProfiles', profileId: 'modern', supportedFormat: 'curb-only' },
  }));
  expect(JSON.stringify(input)).toBe(saved);
});
