import { expect, it } from 'vitest';
import type { Polygon } from '../schema/blueprint';
import { CityGround } from '../src/CityGround';
import { difference, intersection } from '../src/geom/clip';
import { area } from '../src/geom/polygon';
import { ModuleGround } from '../src/streets/construction/modules/ModuleGround';
import { StreetModuleKit } from '../src/streets/construction/modules/StreetModuleKit';

const rectangle = (x0: number, z0: number, x1: number, z1: number): Polygon =>
  [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

it('assigns station bay land once across module sidewalk, reserved open land and building land', () => {
  const kit = new StreetModuleKit();
  const block = kit.block({ id: 'b0', origin: [0, 0], panels: [40, 40],
    sidewalks: [4, 4, 4, 4], finish: 'maintained' });
  const modules = ModuleGround.cover(kit.construction());
  const boundary = rectangle(-4, -4, 44, 44);
  const water = [rectangle(-4, -4, 0, -1)];
  const lot = rectangle(4, 12, 36, 36);
  const stationBays = [rectangle(10, 2, 20, 14), rectangle(18, 2, 24, 8)];
  const input = { boundary, water, roadway: [rectangle(-4, -4, 44, -0.5)],
    blockBounds: [block.outer], modules, lots: [lot], open: [rectangle(4, 4, 36, 12)], stationBays };

  const ground = CityGround.build(input);
  expect(ground.slice(0, modules.length)).toEqual(modules.map(({ blockId, ...region }) =>
    ({ ...region, moduleBlockId: blockId })));
  expect(CityGround.build(input)).toEqual(ground);
  const polygons = ground.map(region => region.polygon);
  expect(difference([boundary], [...water, ...polygons])).toEqual([]);
  expect(difference(polygons, [boundary])).toEqual([]);
  expect(intersection(polygons, water)).toEqual([]);
  expect(polygons.reduce((sum, polygon) => sum + area(polygon), 0))
    .toBeCloseTo(area(boundary) - water.reduce((sum, polygon) => sum + area(polygon), 0), 6);
  for (let i = 0; i < ground.length; i++) {
    for (let j = i + 1; j < ground.length; j++) {
      expect(intersection([ground[i].polygon], [ground[j].polygon]), `ground ${i}/${j}`).toEqual([]);
    }
  }
  const sidewalk = ground.filter(region => region.surface === 'sidewalk');
  expect(difference(stationBays, sidewalk.map(region => region.polygon))).toEqual([]);
  expect(sidewalk.every(region => region.top === 0.2)).toBe(true);
  const buildingLand = ground.filter(region => region.surface === 'block').map(region => region.polygon);
  expect(buildingLand.reduce((sum, polygon) => sum + area(polygon), 0)).toBe(748);
  expect(intersection(ground.filter(region => region.surface === 'block' || region.surface === 'open')
    .map(region => region.polygon), stationBays)).toEqual([]);
});
