import { describe, expect, it } from 'vitest';
import { resolveStreetDesign, sidewalkTotal } from '../src/streets/construction/Design';
import { StreetSections } from '../src/streets/construction/StreetSections';
import { StreetCorridors } from '../src/streets/construction/StreetCorridors';
import { validateStreetSections } from '../src/streets/construction/validateSections';
import { pointInPolygon } from '../src/geom/polygon';
import type { BuiltEdge, BuiltNode } from '../src/streets/Graph';
import type { StreetDesign } from '../src/streets/construction/schema/design';
import { difference, intersection, offset, union } from '../src/geom/clip';

describe('street construction profiles', () => {
  it('publishes complete lane widths and independent side bands before reserving their ground', () => {
    const edges: BuiltEdge[] = [{ id: 'e0', class: 'street', from: 'n0', to: 'n1', path: [[0, 0], [100, 0]] }];
    const nodes: BuiltNode[] = [
      { id: 'n0', position: [0, 0], edgeIds: ['e0'] },
      { id: 'n1', position: [100, 0], edgeIds: ['e0'] },
    ];
    const plan = StreetSections.plan(edges, nodes, resolveStreetDesign(), ([, z]) => z > 0 ? 'residential' : 'commercial');
    const edge = plan.edges[0];
    expect(edge.width).toBe(7);
    expect(edge.sidewalk).toEqual({ left: 3, right: 6.5 });
    expect(edge.crossSection!.lanes).toEqual([
      { direction: 'backward', width: 3.5, offset: 1.75 },
      { direction: 'forward', width: 3.5, offset: -1.75 },
    ]);
    for (const side of ['left', 'right'] as const) {
      expect(sidewalkTotal(edge.crossSection!.sidewalks[side].bands)).toBe(edge.sidewalk[side]);
    }
    const corridors = new StreetCorridors(plan.edges);
    const covers = (point: [number, number]): boolean => corridors.full.some((polygon) => pointInPolygon(point, polygon));
    expect(covers([50, 6.49])).toBe(true);
    expect(covers([50, 6.51])).toBe(false);
    expect(covers([50, -9.99])).toBe(true);
    expect(covers([50, -10.01])).toBe(false);
    const streets = { edges: plan.edges, construction: { version: '1.0.0' as const, runs: plan.runs } };
    expect(() => validateStreetSections({ streets })).not.toThrow();
    edge.sidewalk.right += 0.1;
    expect(() => validateStreetSections({ streets })).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
  });

  it('keeps each road profile across graph fragmentation and follows configured physical dimensions', () => {
    const design = resolveStreetDesign();
    design.profiles = design.profiles.map((profile) => ({ ...profile, lanes: profile.lanes.map((lane) => ({ ...lane, width: 4 })) }));
    const whole: BuiltEdge[] = [{ id: 'e0', class: 'road', from: 'n0', to: 'n2', path: [[0, 0], [100, 0]] }];
    const split: BuiltEdge[] = [
      { id: 'e0', class: 'road', from: 'n0', to: 'n1', path: [[0, 0], [40, 0]] },
      { id: 'e1', class: 'road', from: 'n2', to: 'n1', path: [[100, 0], [40, 0]] },
    ];
    const a = StreetSections.plan(whole, [
      { id: 'n0', position: [0, 0], edgeIds: ['e0'] }, { id: 'n2', position: [100, 0], edgeIds: ['e0'] },
    ], design, () => 'downtown');
    const b = StreetSections.plan(split, [
      { id: 'n0', position: [0, 0], edgeIds: ['e0'] }, { id: 'n1', position: [40, 0], edgeIds: ['e0', 'e1'] },
      { id: 'n2', position: [100, 0], edgeIds: ['e1'] },
    ], design, () => 'downtown');
    expect(a.runs).toHaveLength(1);
    expect(b.runs).toHaveLength(1);
    expect(b.runs[0].length).toBe(a.runs[0].length);
    expect(b.edges.map((edge) => edge.width)).toEqual([16, 16]);
    expect(b.edges.map((edge) => edge.crossSection!.profileId)).toEqual([a.runs[0].profileId, a.runs[0].profileId]);
    expect(b.edges.map((edge) => edge.sidewalk)).toEqual([{ left: 8.5, right: 8.5 }, { left: 8.5, right: 8.5 }]);
  });

  it('rejects incomplete or nonfinite profile settings with the Atlas input error', () => {
    for (const input of [null, { profiles: [], sidewalkProfiles: [] }, {
      ...resolveStreetDesign(), sidewalkProfiles: [{ ...resolveStreetDesign().sidewalkProfiles[0], walking: NaN }],
    }]) {
      expect(() => resolveStreetDesign(input as unknown as StreetDesign)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    }
  });

  it('partitions each bent sidewalk into the published functional bands on shared curves', () => {
    const edges: BuiltEdge[] = [{ id: 'e0', class: 'street', from: 'n0', to: 'n1', path: [[0, 0], [50, 0], [80, 20]] }];
    const plan = StreetSections.plan(edges, [
      { id: 'n0', position: [0, 0], edgeIds: ['e0'] }, { id: 'n1', position: [80, 20], edgeIds: ['e0'] },
    ], resolveStreetDesign(), () => 'downtown');
    for (const side of ['left', 'right'] as const) {
      const complete = StreetCorridors.sidewalk(plan.edges[0], side);
      const bands = (['curb', 'border', 'furnishing', 'walking', 'frontage'] as const)
        .map((role) => StreetCorridors.band(plan.edges[0], side, role));
      expect(offset(difference(complete, union(bands.flat())), -0.005)).toHaveLength(0);
      expect(offset(difference(union(bands.flat()), complete), -0.005)).toHaveLength(0);
      for (let i = 0; i < bands.length; i++) for (let j = i + 1; j < bands.length; j++) {
        expect(offset(intersection(bands[i], bands[j]), -0.005)).toHaveLength(0);
      }
    }
  });
});
