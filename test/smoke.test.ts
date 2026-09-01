import { describe, it } from 'vitest';
import { generateCity } from '../src';

describe('pipeline smoke', () => {
  it('generates a full blueprint', () => {
    const t0 = performance.now();
    const bp = generateCity({ seed: 'smoke-1' });
    const ms = Math.round(performance.now() - t0);
    console.log('ms', ms, 'pop', bp.stats.population);
    console.log(
      'districts', bp.districts.length,
      'nodes', bp.streets.nodes.length,
      'edges', bp.streets.edges.length,
      'blocks', bp.blocks.length,
      'parcels', bp.parcels.length,
    );
    console.log('counts', bp.stats.parcelCounts);
    console.log(
      'bus', bp.transit.busRoutes.length, 'routes', bp.transit.busStops.length, 'stops;',
      'subway', bp.transit.subwayLines.length, 'lines', bp.transit.subwayStations.length, 'stations;',
      'train', bp.transit.trainLines.length, 'lines', bp.transit.trainStations.length, 'stations',
    );
    console.log('ground polys', bp.volumetric.ground.length, 'buildings', bp.volumetric.buildings.length);
  }, 120000);
});
