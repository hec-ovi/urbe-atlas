import type { CityBlueprint } from '../../../schema/blueprint';
const footprint: [number, number][] = [[30, 30], [70, 30], [70, 70], [30, 70]];
const parcel = { id: 'p0', blockId: 'b0', districtId: 'd0', type: 'residential', tier: 'poor', lot: footprint, footprint,
  access: { edgeId: 'e0', point: [30, 50] }, envelope: { minFloors: 1, maxFloors: 4, floorHeight: 3, maxHeight: 12 } };
const blueprint = {
  meta: { version: '0.4.0', seed: 'selection', units: 'meters', gridAngle: 0,
    boundary: [[0, 0], [100, 0], [100, 100], [0, 100]], bounds: { min: [0, 0], max: [100, 100] },
    params: { seed: 'selection', size: { width: 100, depth: 100 } } },
  districts: [], parcels: [parcel], blocks: [],
  streets: { nodes: [], edges: [], crossings: [], signals: [], planting: [], highwayStructures: [] },
  transit: { busStops: [], busRoutes: [], trainStations: [], trainLines: [], subwayStations: [], subwayLines: [] },
  volumetric: { buildings: [{ parcelId: 'p0', footprint, height: 12 }], ground: [] },
  stats: { population: 0, parcelCounts: {}, perDistrict: [] },
};

export function selectionBlueprint(): CityBlueprint { return structuredClone(blueprint) as unknown as CityBlueprint; }
