import { FLOOR_AREA_PER_RESIDENT, RESIDENTIAL_EFFICIENCY } from './ratios';

/** Shared capacity model before integer population reporting. */
export function residentialCapacity(lotArea: number, averageFloors: number): number {
  return lotArea * 0.55 * averageFloors * RESIDENTIAL_EFFICIENCY / FLOOR_AREA_PER_RESIDENT;
}
