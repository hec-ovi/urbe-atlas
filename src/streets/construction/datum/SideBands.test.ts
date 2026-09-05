import { describe, expect, it } from 'vitest';
import type { StreetEdge, Vec2 } from '../../../../schema/blueprint';
import { coversSegment } from '../../../geom/polygon';
import { resolveStreetDesign } from '../Design';
import { StreetCorridors } from '../StreetCorridors';
import { StreetSections } from '../StreetSections';
import { GradeDatum, type GradeDatumInput } from './index';

function request(explicit = true): GradeDatumInput {
  const positions: Vec2[] = [[20, 60], [60, 60], [100, 60], [60, 20]];
  const nodes = positions.map((position, index) => ({
    id: `n${index}`, position, edgeIds: index === 1 ? ['west', 'east', 'stem'] : [index === 0 ? 'west' : index === 2 ? 'east' : 'stem'],
  }));
  const sources = [
    { id: 'west', class: 'road' as const, from: 'n0', to: 'n1', path: [positions[0], positions[1]] },
    { id: 'east', class: 'road' as const, from: 'n1', to: 'n2', path: [positions[1], positions[2]] },
    { id: 'stem', class: 'street' as const, from: 'n3', to: 'n1', path: [positions[3], positions[1]] },
  ];
  const design = resolveStreetDesign(explicit ? {
    ...resolveStreetDesign(),
    sidewalkProfiles: [2, 4].map(paved => ({
      id: `paved-${paved}`, curb: 0.2, border: 0, furnishing: 0.5, walking: paved - 0.5, frontage: 0,
      edge: { curbRise: paved === 2 ? 0.2 : 0.3,
        gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' as const } } },
    })),
    sidewalkAssignments: [
      { district: 'residential', street: 'paved-2', road: 'paved-2' },
      { district: 'commercial', street: 'paved-4', road: 'paved-4' },
    ],
  } : undefined);
  const planned = StreetSections.plan(sources, nodes, design, point => point[1] > 60 ? 'commercial' : 'residential');
  const edges: StreetEdge[] = planned.edges.map(edge => ({
    ...edge, districtIds: [], level: 5,
    elevationProfile: [{ distance: 0, level: 5 }, { distance: 20, level: 5 }, { distance: 40, level: 5 }],
  }));
  return {
    boundary: [[0, 0], [120, 0], [120, 120], [0, 120]],
    edges, structures: [], roadwayTop: 5, pedestrianTop: 5.15, groundFormat: 'side-bands-v1',
  };
}

describe('datum source side bands', () => {
  it('publishes complete role masks and absolute tops from a planner-assigned asymmetric T', () => {
    const input = request();
    const saved = JSON.stringify(input);
    const expected = input.edges.flatMap(edge => (['left', 'right'] as const).flatMap(side =>
      edge.crossSection!.sidewalks[side].geometry!.intervals.map(interval => ({
        edgeId: edge.id, spanIds: [`gs:${edge.id}:0`, `gs:${edge.id}:1`], side,
        role: interval.role, top: input.roadwayTop + interval.top,
        masks: StreetCorridors.band(edge, side, interval.role),
      }))));
    const plan = GradeDatum.plan(input);
    expect(input.edges.map(edge => edge.width)).toEqual([14, 14, 7]);
    expect(input.edges[0].sidewalk.left).not.toBe(input.edges[0].sidewalk.right);
    expect(plan.groundFormat).toBe('side-bands-v1');
    expect(JSON.stringify(plan.grade.sideBands)).toBe(JSON.stringify(expected));
    expect(plan.grade.pedestrian).toEqual([]);
    expect(plan.grade.sideBands!.filter(row => row.role === 'walking').map(row => row.top))
      .toEqual([5.3, 5.2, 5.3, 5.2, 5.2, 5.2]);
    expect(plan.grade.sideBands!.filter(row => row.role === 'frontage').every(row => row.masks.length === 0)).toBe(true);
    expect(plan.grade.full.some(polygon => coversSegment(polygon, [40, 70], [40, 70]))).toBe(true);
    expect(JSON.stringify(GradeDatum.plan(input))).toBe(JSON.stringify(plan));
    expect(JSON.stringify(input)).toBe(saved);
  });

  it('retains curb-only results and separates legacy pedestrian rows in a mixed input', () => {
    const legacy = request(false);
    const { groundFormat: _format, ...oldInput } = legacy;
    const old = GradeDatum.plan(oldInput);
    const opted = GradeDatum.plan(legacy);
    const { groundFormat: _outputFormat, grade: { sideBands, ...grade }, ...rest } = opted;
    expect(sideBands).toEqual([]);
    expect({ ...rest, grade }).toEqual(old);
    const modern = request();
    modern.edges[0] = legacy.edges[0];
    const mixed = GradeDatum.plan(modern);
    expect(mixed.grade.sideBands!.every(row => row.edgeId !== 'west')).toBe(true);
    expect(mixed.grade.pedestrian.length).toBeGreaterThan(0);
    expect(mixed.grade.pedestrian.every(row => row.spanId.startsWith('gs:west:'))).toBe(true);
  });

  it('rejects a complete side excursion through a concave city boundary', () => {
    const input = request();
    input.boundary = [[0, 0], [120, 0], [120, 120], [35, 120], [35, 70], [30, 70], [30, 120], [0, 120]];
    const side = StreetCorridors.sidewalk(input.edges[0], 'left');
    expect(side.flat().every(point => coversSegment(input.boundary, point, point))).toBe(true);
    expect(() => GradeDatum.plan(input)).toThrowError(expect.objectContaining({
      code: 'E_INVARIANT', message: 'datum explicit side leaves the city domain',
      details: expect.objectContaining({ edgeId: 'west', side: 'left', mask: side[0] }),
    }));
  });

  it('rejects modern mixed-height support and unknown output formats', () => {
    const input = request();
    input.edges[0].elevationProfile[2].level = 6;
    expect(() => GradeDatum.plan(input)).toThrowError(expect.objectContaining({
      code: 'E_INVARIANT', message: 'datum explicit side requires a wholly flat source at the roadway datum',
      details: expect.objectContaining({ edgeId: 'west', side: 'left', spanIds: ['gs:west:1'] }),
    }));
    expect(() => GradeDatum.plan({ ...request(), groundFormat: 'future' as never }))
      .toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
    const future = request();
    future.edges[0].crossSection!.sidewalks.left.geometry!.version = 'future' as never;
    expect(() => GradeDatum.plan(future)).toThrowError(expect.objectContaining({
      code: 'E_INVARIANT', message: 'datum side geometry version is unsupported',
      details: { edgeId: 'west', side: 'left', version: 'future' },
    }));
  });
});
