import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { generateCity } from '../../..';
import type { AtlasParams } from '../../../../schema/params';
import type { Polygon } from '../../../../schema/blueprint';
import { difference, intersection } from '../../../geom/clip';
import { area } from '../../../geom/polygon';

const settings = (seed: string, size: number, maximum: number): AtlasParams => ({
  seed, size: { width: size, depth: size }, districtCount: [1, maximum], maxFloors: 40,
  features: { highways: true, subways: true, alleys: false },
});

it.each([
  ['urbe-small', 800, 2, 'n15', [[114, 262], [116, 262], [116, 280], [114, 280]]],
  ['urbe', 1000, 3, 'n10', [[294.5, 147], [312.5, 147], [312.5, 149], [294.5, 149]]],
] as const)('keeps complete grade walking pavement under the %s highway', (seed, size, maximum, nodeId, strip) => {
  const params = settings(seed, size, maximum);
  const city = generateCity(params);
  const region = strip.map(point => [...point]) as Polygon;
  const sidewalk = city.volumetric.ground.filter(ground => ground.surface === 'sidewalk').map(ground => ground.polygon);
  expect(difference([region], sidewalk)).toEqual([]);
  const roadway = city.volumetric.ground.filter(ground => ground.surface === 'roadway').map(ground => ground.polygon);
  expect(intersection([region], roadway).reduce((sum, polygon) => sum + area(polygon), 0)).toBe(0);
  const node = city.streets.nodes.find(candidate => candidate.id === nodeId)!;
  expect(node.connections.map(group => group.level)).toEqual([0, 8]);
  const modules = city.streets.construction!.modules!;
  const underpasses = modules.frontages!.filter(frontage => frontage.id.startsWith(`underpass:${nodeId}:`));
  expect(underpasses).toHaveLength(2);
  for (const frontage of underpasses) {
    expect(difference([frontage.boundary], [city.meta.boundary])).toEqual([]);
    const placement = modules.placements.find(item => item.blockId === frontage.id)!;
    const definition = modules.definitions.find(item => item.id === placement.moduleId)!;
    expect(definition.parts.some(part => part.role === 'panel' && part.top === 0.2)).toBe(true);
  }
  if (size === 800) {
    const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    expect(digest(generateCity(city.meta.params))).toBe(digest(city));
  }
}, 15000);

it('rejects a requested pedestrian clearance that the highway cannot provide', () => {
  const design = generateCity({ seed: 'clearance-profiles', size: { width: 400, depth: 400 },
    features: { highways: false, subways: false },
  }).meta.params.streetDesign;
  expect(() => generateCity({ ...settings('urbe-small', 800, 2),
    streetDesign: { ...design, crossings: { pedestrianClearance: 8 } },
  })).toThrowError(expect.objectContaining({ code: 'E_UNSATISFIABLE' }));
});
