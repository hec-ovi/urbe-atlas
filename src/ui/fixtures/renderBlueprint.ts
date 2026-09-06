import type { CityBlueprint, Polygon, Station, StreetEdge } from '../../../schema/blueprint';
import { selectionBlueprint } from './selectionBlueprint';

const rectangle = (x: number, z: number, width: number, depth: number): Polygon =>
  [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]];

/** Published render data covers crossing roads, highway ramps, stations and water without generation. */
export function renderBlueprint(): CityBlueprint {
  const blueprint = selectionBlueprint();
  const edge = (id: string, kind: StreetEdge['class'], path: StreetEdge['path'], width: number): StreetEdge => ({
    id, class: kind, from: `${id}-start`, to: `${id}-end`, path, width, sidewalk: { left: 2, right: 2 },
    districtIds: [], level: 0, elevationProfile: [{ distance: 0, level: 0 }, { distance: 100, level: 0 }],
  });
  blueprint.streets.edges = [edge('e0', 'street', [[0, 20], [100, 20]], 10), edge('e1', 'road', [[20, 0], [20, 100]], 14)];
  blueprint.volumetric.ground = [{ surface: 'roadway', polygon: rectangle(0, 15, 100, 10), bottom: -0.2, top: 0 },
    { surface: 'roadway', polygon: rectangle(13, 0, 14, 15), bottom: -0.2, top: 0 },
    { surface: 'roadway', polygon: rectangle(13, 25, 14, 75), bottom: -0.2, top: 0 }];
  blueprint.streets.crossings = [{ nodeId: 'junction', segments: [{ edgeId: 'e0', from: [10, 13], to: [10, 27], width: 3,
    markings: [rectangle(9, 15, 2, 1), rectangle(9, 18, 2, 1), rectangle(9, 21, 2, 1)] }] }];
  blueprint.streets.highwayStructures = [{ edgeIds: ['highway'], path: [[0, 90], [100, 90]], width: 15, level: 8,
    deckThickness: 1, ramps: { start: 20, end: 20 }, elevationProfile: [
      { distance: 0, level: 0 }, { distance: 20, level: 8 }, { distance: 80, level: 8 }, { distance: 100, level: 0 },
    ], supports: [{ position: [50, 90], footprint: rectangle(49, 89, 2, 2), bottom: 0, top: 7 }] }];
  const station = (id: string, x: number, level: number): Station => ({
    id, position: [x, 8], districtId: 'd0', platform: rectangle(x - 3, 6, 6, 4), box: { bottom: level, top: level + 3 },
    entrances: [[x, 12]], level, shafts: level < 0 ? [{ footprint: rectangle(x - 1, 11, 2, 2), top: 0, bottom: level,
      passage: rectangle(x - 1, 8, 2, 4) }] : [],
    accessPaths: level < 0 ? [{ entranceIndex: 0, segments: [{ kind: 'stairs', path: [[x, 0, 12], [x, level, 8]] }],
      platformHandoff: [x, level, 8] }] : [],
  });
  blueprint.transit.trainStations = [station('ts0', 80, 0)];
  blueprint.transit.trainLines = [{ id: 'tl0', stationIds: ['ts0'], path: [[72, 8], [98, 8]], underground: false, level: 0, width: 4 }];
  blueprint.transit.subwayStations = [station('ss0', 35, -8), station('ss1', 65, -8)];
  blueprint.transit.subwayLines = [{ id: 'sl0', stationIds: ['ss0', 'ss1'], path: [[30, 8], [70, 8]], underground: true, level: -8, width: 5 }];
  blueprint.hydrology = { seedId: 'render-water', type: 'river', structures: [], bodies: [{ id: 'water0', type: 'river',
    surfaces: [rectangle(80, 30, 15, 45)], shorelines: [{ id: 'shore0', path: rectangle(80, 30, 15, 45), closed: true,
      band: [rectangle(80, 30, 1, 45)] }], elevation: -0.2, depth: 3, materialKey: 'water.river' }] };
  return blueprint;
}
