import { describe, expect, it } from 'vitest';
import { resolveStreetDesign } from '../construction/Design';
import { StreetDomain } from './StreetDomain';
import { validateStreetDomain } from './validateStreetDomain';
import type { StreetDomainState } from './schema';

describe('street domain', () => {
  it('reserves configured dimensions and refuses a collapsed inset', () => {
    const design = resolveStreetDesign();
    const domain = StreetDomain.reserve({
      boundary: [[0, 0], [200, 0], [200, 200], [0, 200]], design, highways: true, alleys: true,
    });
    expect(domain.clearance).toBe(19.002);
    expect(domain.covers([[19.002, 50], [180.998, 50]])).toBe(true);
    expect(domain.covers([[19, 50], [181, 50]])).toBe(false);
    design.profiles = design.profiles.map((profile) => ({
      ...profile, shoulders: { left: 3, right: 1 },
    }));
    expect(StreetDomain.reserve({
      boundary: [[0, 0], [200, 0], [200, 200], [0, 200]], design, highways: false, alleys: false,
    }).clearance).toBe(21.002);
    expect(() => StreetDomain.reserve({
      boundary: [[0, 0], [20, 0], [20, 20], [0, 20]], design, highways: false, alleys: false,
    })).toThrowError(expect.objectContaining({ code: 'E_UNSATISFIABLE' }));
  });

  it('rejects declared outer sidewalk land beyond the city boundary', () => {
    const state: StreetDomainState = {
      meta: { boundary: [[0, 0], [100, 0], [100, 100], [0, 100]] },
      streets: { edges: [{
        id: 'e0', class: 'street', from: 'n0', to: 'n1', path: [[15, 50], [85, 50]],
        width: 7, sidewalk: { left: 4.5, right: 6.5 }, districtIds: [], level: 0,
        elevationProfile: [{ distance: 0, level: 0 }, { distance: 70, level: 0 }],
      }] },
    };
    expect(() => validateStreetDomain(state)).not.toThrow();
    state.streets.edges[0].path = [[15, 5], [85, 5]];
    expect(() => validateStreetDomain(state)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });
});
