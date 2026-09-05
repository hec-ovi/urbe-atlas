import { describe, expect, it } from 'vitest';
import { generateCity } from '../src';
import { validateStreetDomain } from '../src/streets/domain/validateStreetDomain';
import { StreetCorridors } from '../src/streets/construction/StreetCorridors';

describe('complete street land reservation', () => {
  it('publishes complete selected widths inside the review city boundary', () => {
    const city = generateCity({
      seed: 'interior-review-1km-01', size: { width: 1000, depth: 1000 }, maxFloors: 8,
      features: { highways: false, trains: false, subways: false },
    });
    expect(() => validateStreetDomain(city)).not.toThrow();
    expect(city.streets.construction!.planningReservations).toEqual(StreetCorridors.reservations(city.streets.edges));
  });
});
