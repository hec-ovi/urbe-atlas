import { expect, it } from 'vitest';
import type { Polygon } from '../../schema/blueprint';
import { FootprintHost } from './FootprintHost';
import { hostingProfile } from './profiles';

it('fits complete compact stair columns behind the corporate setback on the building grid', () => {
  const host = new FootprintHost({
    shape: 'rectangle', grid: { origin: [0, 0], angle: 0, spacing: 0.5 },
  });
  const profile = hostingProfile('corpo');
  const narrow: Polygon = [[0, 0], [15, 0], [15, 16], [0, 16]];
  const sufficient: Polygon = [[0, 0], [15.5, 0], [15.5, 16], [0, 16]];

  expect(host.fit(narrow, profile)).toBeNull();
  expect(host.fit(sufficient, profile)).toEqual({
    footprint: [[1, 1], [14.5, 1], [14.5, 15], [1, 15]], floorCap: Infinity,
  });
});
