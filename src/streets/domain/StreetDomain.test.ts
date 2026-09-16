import { describe, expect, it } from 'vitest';
import { resolveStreetDesign } from '../construction/Design';
import { StreetDomain } from './StreetDomain';
import { validateStreetDomain } from './validateStreetDomain';
import type { StreetDomainState } from './schema';

describe('street domain', () => {
  it('reserves configured dimensions and refuses a collapsed inset', () => {
    const design = resolveStreetDesign({
      profiles: [
        { id: 'street', classes: ['street'], lanes: [{ direction: 'forward', width: 4 }], shoulders: { left: 0, right: 0 } },
        { id: 'avenue', classes: ['road'], lanes: [
          { direction: 'backward', width: 3.5 }, { direction: 'backward', width: 3.5 },
          { direction: 'forward', width: 3.5 }, { direction: 'forward', width: 3.5 },
        ], shoulders: { left: 0, right: 0 } },
      ],
      sidewalkProfiles: [2, 6].map((walking) => ({
        id: `paved-${walking}`, curb: 0.2, border: 0, furnishing: 0, walking, frontage: 0,
        edge: { curbRise: 0.2, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' } } },
      })),
    });
    const domain = StreetDomain.reserve({
      boundary: [[0, 0], [200, 0], [200, 200], [0, 200]], design, highways: true, alleys: true,
    });
    expect(domain.clearance).toBe(13.502);
    expect(domain.covers([[13.502, 50], [186.498, 50]])).toBe(true);
    expect(domain.covers([[13.5, 50], [186.5, 50]])).toBe(false);
    design.profiles = design.profiles.map((profile) => ({
      ...profile, shoulders: { left: 3, right: 1 },
    }));
    expect(StreetDomain.reserve({
      boundary: [[0, 0], [200, 0], [200, 200], [0, 200]], design, highways: false, alleys: false,
    }).clearance).toBe(15.502);
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
