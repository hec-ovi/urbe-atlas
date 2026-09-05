import { describe, expect, it } from 'vitest';
import { generateCity } from '../src';
import { isSimpleRing } from '../src/geom/polygon';

describe('Boolean ring publication', () => {
  it('publishes simple block and ground rings after per-side corridor clipping', () => {
    const city = generateCity({ seed: 'profile-preview', size: { width: 1000, depth: 1000 }, features: { trains: false, subways: false } });
    expect(city.blocks.flatMap((block) => [block.boundary, ...block.sidewalk, ...block.curb]).every(isSimpleRing)).toBe(true);
    expect(city.volumetric.ground.every((region) => isSimpleRing(region.polygon))).toBe(true);
  });
});
