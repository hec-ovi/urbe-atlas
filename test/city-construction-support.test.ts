import { expect, it } from 'vitest';
import type { AtlasParams } from '../schema/params';
import { generateCity } from '../src';
import { CityConstructionSupport } from '../src/CityConstructionSupport';
import { resolveStreetDesign } from '../src/streets/construction/Design';

const legacy = { id: 'legacy', curb: 0.15, border: 0.2, furnishing: 0.5, walking: 2, frontage: 0.15 };

it('accepts resolved module defaults without changing them', () => {
  const design = resolveStreetDesign();
  const saved = JSON.stringify(design);
  expect(CityConstructionSupport.assert(design)).toBeUndefined();
  expect(JSON.stringify(design)).toBe(saved);
});

it('rejects a configured curb-only profile even when assignments select a module profile', () => {
  const design = resolveStreetDesign();
  const input: AtlasParams = {
    seed: 'city-consumer-capability', size: { width: 400, depth: 400 },
    streetDesign: {
      ...design, sidewalkProfiles: [...design.sidewalkProfiles, legacy],
      sidewalkAssignments: [{ district: 'residential', street: 'compact', road: 'compact' }],
    },
  };
  const saved = JSON.stringify(input);
  expect(() => generateCity(input)).toThrowError(expect.objectContaining({
    code: 'E_INVALID_PARAMS',
    details: { field: 'streetDesign.sidewalkProfiles', profileId: 'legacy', supportedFormat: 'modules' },
  }));
  expect(JSON.stringify(input)).toBe(saved);
});

it('rejects fractional carriageway widths before constructing city geometry', () => {
  const design = resolveStreetDesign();
  design.profiles[0]!.lanes[0]!.width = 3.5;
  const input: AtlasParams = { seed: 'fractional-carriageway', streetDesign: design };
  const saved = JSON.stringify(input);
  expect(() => generateCity(input)).toThrowError(expect.objectContaining({
    code: 'E_INVALID_PARAMS',
    details: { field: 'streetDesign.profiles', profileId: 'one-way', supportedFormat: 'modules' },
  }));
  expect(JSON.stringify(input)).toBe(saved);
});
