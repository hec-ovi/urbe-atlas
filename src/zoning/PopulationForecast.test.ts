import { describe, expect, it } from 'vitest';
import { Zoning } from './Zoning';
import type { DistrictCapacityInput } from './population-schema';

describe('zoning population forecast', () => {
  it('reports district residential capacity from net land, use, tier and floor caps without parcel generation', () => {
    const districts: DistrictCapacityInput[] = [
      { districtId: 'd0', kind: 'residential', tier: 'poor', maxFloors: 1, landArea: 10_000 },
      { districtId: 'd1', kind: 'industrial', tier: 'poor', maxFloors: 40, landArea: 10_000 },
      { districtId: 'd2', kind: 'mixed', tier: 'high_rich', maxFloors: 40, landArea: 20_000 },
      { districtId: 'd3', kind: 'mixed', tier: 'poor', maxFloors: 4, landArea: 20_000 },
    ];
    const forecast = Zoning.populationForecast(districts);
    expect(forecast.districts.map((district) => district.districtId)).toEqual(['d0', 'd1', 'd2', 'd3']);
    expect(forecast.districts[0]).toEqual({ districtId: 'd0', residentialArea: 8600, meanResidentialFloors: 1, populationEstimate: 108 });
    expect(forecast.districts[1].populationEstimate).toBe(0);
    expect(forecast.districts[2].residentialArea).toBe(10_400);
    expect(forecast.districts[2].populationEstimate).toBeGreaterThan(forecast.districts[3].populationEstimate);
    expect(forecast.populationEstimate).toBe(forecast.districts.reduce((sum, district) => sum + district.populationEstimate, 0));
    expect(Zoning.populationForecast(districts)).toEqual(forecast);
    expect(Zoning.populationForecast([])).toEqual({ populationEstimate: 0, districts: [] });
  });

  it('rejects malformed district capacity input through the public zoning entry point', () => {
    const district = { districtId: 'd0', kind: 'mixed', tier: 'mid', maxFloors: 4, landArea: 1000 };
    for (const input of [null, [null], [{ ...district, landArea: -1 }], [{ ...district, landArea: Infinity }],
      [{ ...district, kind: 'unknown' }], [{ ...district, tier: 'unknown' }], [{ ...district, maxFloors: 0 }], [district, district]]) {
      expect(() => Zoning.populationForecast(input as unknown as DistrictCapacityInput[]))
        .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    }
  });
});
