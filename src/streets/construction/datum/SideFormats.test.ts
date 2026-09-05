import { describe, expect, it } from 'vitest';
import type { StreetEdge } from '../../../../schema/blueprint';
import { resolveStreetDesign } from '../Design';
import { StreetSections } from '../StreetSections';
import { GradeDatum, type GradeDatumInput } from './index';

function inputs(side: 'left' | 'right'): { legacy: GradeDatumInput; explicit: GradeDatumInput } {
  const path: StreetEdge['path'] = [[20, 50], [80, 50]];
  const source = { id: 'street', class: 'street' as const, from: 'a', to: 'b', path };
  const nodes = path.map((position, index) => ({ id: index ? 'b' : 'a', position, edgeIds: ['street'] }));
  const legacyPlan = StreetSections.plan([source], nodes, resolveStreetDesign(), () => 'residential');
  const explicitPlan = StreetSections.plan([source], nodes, resolveStreetDesign({
    ...resolveStreetDesign(),
    sidewalkProfiles: [{
      id: 'paved-two', curb: 0.2, border: 0, furnishing: 0.5, walking: 1.5, frontage: 0,
      edge: { curbRise: 0.2, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' } } },
    }],
  }), () => 'residential');
  const legacyStreet: StreetEdge = {
    ...legacyPlan.edges[0], districtIds: [], level: 0,
    elevationProfile: [{ distance: 0, level: 0 }, { distance: 60, level: 0 }],
  };
  const explicitStreet = structuredClone(legacyStreet);
  explicitStreet.crossSection!.sidewalks[side] = explicitPlan.edges[0].crossSection!.sidewalks[side];
  explicitStreet.sidewalk[side] = explicitPlan.edges[0].sidewalk[side];
  const highway: StreetEdge = {
    id: 'highway', class: 'highway', from: 'south', to: 'north', path: [[50, -20], [50, 120]],
    width: 15, sidewalk: { left: 0, right: 0 }, districtIds: [], level: 8,
    elevationProfile: [{ distance: 0, level: 8 }, { distance: 140, level: 8 }],
  };
  const legacy: GradeDatumInput = {
    boundary: [[0, 0], [100, 0], [100, 100], [0, 100]],
    edges: [legacyStreet, highway], roadwayTop: 0, pedestrianTop: 0.15,
    structures: [{
      edgeIds: [highway.id], path: highway.path, width: highway.width, level: 8, deckThickness: 1,
      ramps: { start: 0, end: 0 }, elevationProfile: highway.elevationProfile,
    }],
  };
  return { legacy, explicit: { ...legacy, edges: [explicitStreet, highway] } };
}

describe('datum side-format boundary', () => {
  it.each(['left', 'right'] as const)('rejects an explicit %s side at the full-plan entry', side => {
    const { explicit } = inputs(side);
    const saved = JSON.stringify(explicit);
    expect(() => GradeDatum.plan(explicit)).toThrowError(expect.objectContaining({
      code: 'E_INVARIANT', message: 'grade datum requires curb-only sidewalk sections',
      details: { edgeId: 'street', side, version: '1.0.0' },
    }));
    expect(JSON.stringify(explicit)).toBe(saved);
  });

  it('preserves independent roadway and physical queries with explicit side intervals', () => {
    const { legacy, explicit } = inputs('left');
    const saved = JSON.stringify(explicit);
    const roadway = GradeDatum.roadwayPlan(explicit);
    const physical = GradeDatum.physicalPlan(explicit);
    expect(roadway.roadway.length).toBeGreaterThan(0);
    expect(physical.physical.length).toBeGreaterThan(0);
    expect(roadway).toEqual(GradeDatum.roadwayPlan(legacy));
    expect(physical).toEqual(GradeDatum.physicalPlan(legacy));
    expect(JSON.stringify(explicit)).toBe(saved);
  });
});
