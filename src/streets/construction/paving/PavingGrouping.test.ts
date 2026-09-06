import { describe, expect, it } from 'vitest';
import type { GroundSurface, Polygon, StreetEdge, StreetNode, Vec2 } from '../../../../schema/blueprint';
import { SourcePartition } from '../../../geom/partition/SourcePartition';
import { resolveStreetDesign } from '../Design';
import { StreetSections } from '../StreetSections';
import { PavingPlanner } from './PavingPlanner';
import type { PublishedPavingInput, SharedPavingInput } from './producer-schema';
import type { PavingDesign, PavingModule } from './schema';

const rect = (x0: number, z0: number, x1: number, z1: number): Polygon => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

function design(width: number): PavingDesign {
  return { defaultLayoutId: 'panels', districtLayouts: [], layouts: [{ id: 'panels', familyId: 'concrete',
    modules: [{ id: 'base', pitch: [1, 1], joint: [0.012, 0.012] },
      { id: 'group', pitch: [2, 2], baseCells: [2, 2], joint: [0.012, 0.012] }],
    bands: { curb: { moduleId: 'base', borderWidth: 0 }, border: { moduleId: 'base', borderWidth: 0 },
      furnishing: { moduleId: 'base', borderWidth: 0 }, frontage: { moduleId: 'base', borderWidth: 0 },
      walking: { moduleId: 'base', borderWidth: 0,
        grouping: { moduleId: 'group', period: [2, width === 4 ? 4 : 2], offset: [0, width === 4 ? 1 : 0] } } } }] };
}

function source(width: number, side: 'left' | 'right'): SharedPavingInput {
  const nodes: StreetNode[] = [[0, 0], [12, 0]].map((position, index) => ({ id: `n${index}`,
    position: position as Vec2, edgeIds: ['e0'], connections: [{ level: 0, edgeIds: ['e0'] }] }));
  const edge: StreetEdge = { id: 'e0', from: 'n0', to: 'n1', path: nodes.map(node => node.position),
    class: 'street', width: 7, sidewalk: { left: 0, right: 0 }, districtIds: [], level: 0,
    elevationProfile: [{ distance: 0, level: 0 }, { distance: 12, level: 0 }] };
  const planned = StreetSections.plan([edge], nodes, resolveStreetDesign({ ...resolveStreetDesign(), sidewalkProfiles: [{ id: 'walk',
    curb: 0.15, border: 0, furnishing: 0, walking: width, frontage: 0 }] }), () => 'downtown');
  const near = side === 'left' ? 3650 : -3650;
  const far = near + (side === 'left' ? 1 : -1) * width * 1000;
  const boundary = rect(0, Math.min(near, far) / 1000, 12, Math.max(near, far) / 1000);
  return { streets: { nodes, edges: planned.edges, crossings: [], construction: { version: '1.0.0', runs: planned.runs } },
    districts: [], design: design(width), groundSource: {
      partition: SourcePartition.create({ id: 'walking', source: boundary, coordinateScale: 1000 }),
      boundary, coordinateScale: 1000, excludedOwnerIds: [],
      owners: [{ ownerId: 'walking', surface: 'sidewalk', bottom: 0, top: 0.2 }],
    } };
}

function published(input: SharedPavingInput): PublishedPavingInput {
  const output = PavingPlanner.planShared(input);
  return { meta: { boundary: input.groundSource.boundary },
    streets: { ...input.streets, construction: { ...input.streets.construction, paving: output.construction } },
    volumetric: { ground: output.ground }, transit: { trainStations: [], subwayStations: [] } };
}

// Independent public-coordinate expansion preserves group interiors as one slab.
function slabs(ground: GroundSurface[], modules: PavingModule[]) {
  return ground.flatMap(owner => {
    const part = owner.construction!.part;
    if (part.kind !== 'grid') return [];
    const module = modules.find(module => module.id === part.moduleId)!;
    const count = module.baseCells ?? [1, 1], offset = part.baseOffset ?? [0, 0];
    return part.cells.flatMap(span => Array.from({ length: span.to - span.from }, (_, index) => {
      const column = span.from + index;
      return { module,
        local: [
          (column * count[0] + offset[0]) * module.pitch[0] / count[0],
          (span.row * count[1] + offset[1]) * module.pitch[1] / count[1],
        ] as Vec2,
      };
    }));
  });
}

describe('whole-width paving groups', () => {
  it.each([[4, 'left'], [4, 'right'], [6, 'left']] as const)(
    'fits %i m on the %s as complete rows on one walking owner', (width, side) => {
      const city = published(source(width, side));
      PavingPlanner.validatePublished(JSON.parse(JSON.stringify(city)));
      const paving = city.streets.construction!.paving!;
      expect(paving.version).toBe(width === 4 ? '1.2.0' : '1.1.0');
      expect(paving.regions).toHaveLength(1);
      expect(paving.regions[0].band).toBe('walking');
      expect(city.streets.edges[0].crossSection!.sidewalks[side].bands).toEqual({
        curb: 0.15, border: 0, furnishing: 0, walking: width, frontage: 0,
      });
      expect(city.volumetric.ground.every(owner => owner.construction?.part.kind === 'grid')).toBe(true);
      const frame = paving.frames[0], modules = paving.layouts[0].modules;
      const expanded = slabs(city.volumetric.ground, modules);
      const firstColumn = expanded.filter(slab => slab.local[0] === 0).sort((a, b) => a.local[1] - b.local[1]);
      expect(firstColumn.map(slab => slab.module.pitch[1])).toEqual(width === 4 ? [1, 2, 1] : [2, 2, 2]);
      expect(expanded.filter(slab => slab.module.id === 'group')).toHaveLength(width === 4 ? 6 : 18);
      expect(firstColumn.map(slab => slab.local[1])).toEqual(side === 'right' ? [-4, -3, -1] : width === 4 ? [0, 1, 3] : [0, 2, 4]);
      for (const owner of city.volumetric.ground) {
        expect(owner.bottom).toBe(0);
        expect(owner.top).toBe(0.2);
        for (const point of owner.polygon) {
          const x = point[0] - frame.origin[0], z = point[1] - frame.origin[1];
          const u = x * frame.u[0] + z * frame.u[1];
          const v = -x * frame.u[1] + z * frame.u[0];
          expect(u).toBeCloseTo(Math.round(u), 12);
          expect(v).toBeCloseTo(Math.round(v), 12);
        }
      }
      if (width === 4) {
        const grouped = city.volumetric.ground.find(owner => owner.construction!.part.kind === 'grid'
          && owner.construction!.part.moduleId === 'group')!;
        const bases = city.volumetric.ground.filter(owner => owner !== grouped);
        const shared = grouped.polygon.filter(point => bases.some(base => base.polygon.some(other => other[0] === point[0] && other[1] === point[1])));
        expect(shared).toHaveLength(26);
      } else {
        expect(city.volumetric.ground.every(owner => owner.construction!.part.kind === 'grid'
          && owner.construction!.part.baseOffset === undefined)).toBe(true);
      }
    });

  it('keeps longitudinal offsets on metre stations and fills the incomplete end groups', () => {
    const input = source(4, 'left');
    input.design.layouts[0].bands.walking.grouping!.offset[0] = 1;
    const city = published(input);
    PavingPlanner.validatePublished(JSON.parse(JSON.stringify(city)));
    const paving = city.streets.construction!.paving!;
    const expanded = slabs(city.volumetric.ground, paving.layouts[0].modules);
    expect(expanded.filter(slab => slab.module.id === 'group').map(slab => slab.local)).toEqual([
      [1, 1], [3, 1], [5, 1], [7, 1], [9, 1],
    ]);
    for (const end of [0, 11]) {
      expect(expanded.filter(slab => slab.local[0] === end).map(slab => slab.module.pitch)).toEqual([
        [1, 1], [1, 1], [1, 1], [1, 1],
      ]);
    }
  });

  it('rejects offsets that move groups or use an unsupported saved formula', () => {
    const city = published(source(4, 'left'));
    for (const offset of [undefined, [0, 0], [0, 0.5], [0, 3]]) {
      const changed = structuredClone(city);
      const part = changed.volumetric.ground.find(owner => owner.construction!.part.kind === 'grid'
        && owner.construction!.part.moduleId === 'group')!.construction!.part;
      if (part.kind === 'grid') part.baseOffset = offset as [number, number] | undefined;
      expect(() => PavingPlanner.validatePublished(changed)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    }
    city.streets.construction!.paving!.version = '1.1.0';
    expect(() => PavingPlanner.validatePublished(city)).toThrowError(expect.objectContaining({ code: 'E_INVARIANT' }));
    const malformed = design(4);
    malformed.layouts[0].bands.walking.grouping!.offset[1] = 0.5;
    expect(() => PavingPlanner.validateDesign(malformed)).toThrowError(expect.objectContaining({ code: 'E_INVALID_PARAMS' }));
  });
});
