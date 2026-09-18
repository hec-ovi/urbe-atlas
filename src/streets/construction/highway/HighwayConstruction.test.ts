import { describe, expect, it } from 'vitest';
import type { Polygon, StreetEdge } from '../../../../schema/blueprint';
import { intersection } from '../../../geom/clip';
import { area } from '../../../geom/polygon';
import { LEVELS } from '../../../levels';
import { HIGHWAY_WIDTH } from '../../widths';
import {
  applyHighwayElevationProfiles, HIGHWAY_DECK, highwayEnvelopes, highwayStructures,
  supportHighwayEnvelopes,
} from './index';
import type { HighwayConstructionEdge } from './index';

const graphEdge = (): HighwayConstructionEdge => ({
  id: 'e0', class: 'highway', from: 'n0', to: 'n1', path: [[0, 0], [240, 0]],
});

function assignedEdges(): StreetEdge[] {
  const graph: HighwayConstructionEdge[] = [
    { ...graphEdge(), path: [[0, 0], [100, 0]] },
    { ...graphEdge(), id: 'e1', from: 'n2', to: 'n1', path: [[240, 0], [100, 0]] },
  ];
  const edges: StreetEdge[] = graph.map(edge => ({
    ...edge, width: 18, level: 10, sidewalk: { left: 0, right: 0 },
    districtIds: [], elevationProfile: [],
  }));
  applyHighwayElevationProfiles(edges);
  return edges;
}

function freeze(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}

describe('staged highway construction', () => {
  it('plans without obstacles and adds supports without changing the early envelope', () => {
    const edges = [graphEdge()];
    freeze(edges);
    const envelopes = highwayEnvelopes(edges);
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]).toMatchObject({
      width: HIGHWAY_WIDTH, level: LEVELS.highway, deckThickness: HIGHWAY_DECK.thickness,
      ramps: { start: HIGHWAY_DECK.rampLength, end: HIGHWAY_DECK.rampLength },
    });
    expect(envelopes[0]).not.toHaveProperty('supports');
    freeze(envelopes);
    const crossing: Polygon = [[70, -8], [80, -8], [80, 8], [70, 8]];
    const structures = supportHighwayEnvelopes(envelopes, [crossing]);
    expect(structures.map(({ supports, ...envelope }) => {
      expect(supports.length).toBeGreaterThan(0);
      for (const support of supports) {
        expect(intersection([support.footprint], [crossing]).reduce((sum, polygon) => sum + area(polygon), 0))
          .toBeLessThanOrEqual(1e-6);
      }
      return envelope;
    })).toEqual(envelopes);
    expect(structures).toEqual(highwayStructures(edges, [crossing]));
    const blocked: Polygon = [[60, -9], [180, -9], [180, 9], [60, 9]];
    expect(() => supportHighwayEnvelopes(envelopes, [blocked]))
      .toThrow(expect.objectContaining({ code: 'E_INVARIANT' }));
    expect(envelopes[0]).not.toHaveProperty('supports');
  });

  it('uses the same canonical ramps for reversed routing edges and early envelopes', () => {
    const edges = assignedEdges();
    expect(edges[0].elevationProfile).toEqual([
      { distance: 0, level: 0 }, { distance: 60, level: 10 }, { distance: 100, level: 10 },
    ]);
    expect(edges[1].elevationProfile).toEqual([
      { distance: 0, level: 0 }, { distance: 60, level: 10 }, { distance: 140, level: 10 },
    ]);
    freeze(edges);
    const envelopes = highwayEnvelopes(edges);
    expect(envelopes[0].elevationProfile).toEqual([
      { distance: 0, level: 0 }, { distance: 60, level: 10 },
      { distance: 180, level: 10 }, { distance: 240, level: 0 },
    ]);
    expect(envelopes[0].path).toEqual([[0, 0], [100, 0], [240, 0]]);
    expect(supportHighwayEnvelopes(envelopes)).toEqual(highwayStructures(edges));
  });

  it('stands a column at each edge of a district avenue and spreads the rest evenly', () => {
    // 27.6 m of avenue, its curbs and both underpass sidewalks: wider than the pitch
    // less a column, so the deck is carried from both edges at once.
    const crossing: Polygon = [[101.7, -8], [129.3, -8], [129.3, 8], [101.7, 8]];
    const envelopes = highwayEnvelopes([graphEdge()]);
    const structures = supportHighwayEnvelopes(envelopes, [crossing]);
    expect(structures[0].supports.map(support => support.position)).toEqual([
      [80.35, 0], [100.7, 0], [130.3, 0], [155.15, 0],
    ]);
    let previous = envelopes[0].ramps.start;
    for (const support of structures[0].supports) {
      expect(support.position[0] - previous).toBeLessThanOrEqual(HIGHWAY_DECK.supportPitch);
      expect(support.position[0] - previous).toBeGreaterThanOrEqual(HIGHWAY_DECK.supportSize);
      expect(area(support.footprint)).toBe(4);
      expect(intersection([support.footprint], [crossing])).toEqual([]);
      previous = support.position[0];
    }
    const flatEnd = 240 - envelopes[0].ramps.end;
    expect(flatEnd - previous).toBeLessThanOrEqual(HIGHWAY_DECK.supportPitch);
    expect(supportHighwayEnvelopes(envelopes, [crossing])).toEqual(structures);
  });

  it('bridges the widest crossing the pitch allows and refuses a wider one', () => {
    const envelopes = highwayEnvelopes([graphEdge()]);
    const band = (width: number): Polygon => {
      const start = 120 - width / 2, end = start + width;
      return [[start, -8], [end, -8], [end, 8], [start, 8]];
    };
    // A column stands 1 m clear of each edge, so 28 m of crossing still bridges at 30 m.
    const widest = supportHighwayEnvelopes(envelopes, [band(28)])[0].supports.map(support => support.position[0]);
    expect(widest).toContain(105);
    expect(widest).toContain(135);
    expect(() => supportHighwayEnvelopes(envelopes, [band(28.1)]))
      .toThrow(expect.objectContaining({ code: 'E_INVARIANT' }));
  });

  it('rejects an assigned profile that omits a ramp breakpoint', () => {
    const edges = assignedEdges();
    edges[0].elevationProfile.splice(1, 1);
    expect(() => highwayEnvelopes(edges)).toThrow(/edge e0 elevation profile conflicts/);
  });

  it('rejects an assigned profile that does not cover its complete path', () => {
    const edges = assignedEdges();
    edges[0].elevationProfile.pop();
    expect(() => highwayEnvelopes(edges)).toThrow(/edge e0 has an incomplete elevation profile/);
  });

  it('rejects conflicting dimensions within one run', () => {
    const edges = assignedEdges();
    edges[1].width += 1;
    expect(() => highwayEnvelopes(edges)).toThrow(/dimensions disagree with edge e1/);
  });

  it('returns no construction for an empty highway network', () => {
    const edges: HighwayConstructionEdge[] = [{ ...graphEdge(), class: 'street' }];
    expect(highwayEnvelopes(edges)).toEqual([]);
    expect(supportHighwayEnvelopes([])).toEqual([]);
    expect(highwayStructures(edges)).toEqual([]);
  });
});
