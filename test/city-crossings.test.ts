/** City crossing entry: dimensioned fields over real ground, water exclusions and saved-plan validation. */
import { describe, expect, it } from 'vitest';
import type { GroundSurface, Polygon, StreetEdge, StreetNode, Vec2 } from '../schema/blueprint';
import { CityCrossings } from '../src/CityCrossings';
import { ModuleGround } from '../src/streets/construction/modules/ModuleGround';
import { StreetModuleKit } from '../src/streets/construction/modules/StreetModuleKit';
import { crossSection, sideSection } from '../src/streets/layout/Sections';
import { streetNodesWithConnections } from '../src/streets/Connections';
import { Signals } from '../src/streets/Signals';
import { difference, intersection } from '../src/geom/clip';
import { GridLayout } from '../src/streets/layout/GridLayout';
import { resolveStreetDesign } from '../src/streets/construction/Design';

const rect = (x: number, z: number, w: number, d: number): Polygon => [[x, z], [x + w, z], [x + w, z + d], [x, z + d]];

function fixture() {
  const side = sideSection({ id: 'paved4', curb: 0.2, border: 0, furnishing: 1, walking: 2, frontage: 1,
    edge: { curbRise: 0.2, gutter: { width: 0.3, lip: { width: 0.02, height: 0.02, side: 'road' } } } });
  const profile = { id: 'road4', classes: ['road' as const], lanes: Array.from({ length: 4 }, () => ({ direction: 'forward' as const, width: 3.5 })),
    shoulders: { left: 0, right: 0 } };
  const positions: Vec2[] = [[0, 0], [60, 0], [0, 60], [-60, 0], [0, -60]];
  const edges: StreetEdge[] = positions.slice(1).map((point, i) => ({ id: `e${i}`, class: 'road', from: 'n0', to: `n${i + 1}`,
    path: [[0, 0], point], width: 14, sidewalk: { left: 4.5, right: 4.5 }, districtIds: ['d0'],
    crossSection: crossSection(`run${i % 2}`, profile, side, side), level: 0,
    elevationProfile: [{ distance: 0, level: 0 }, { distance: 60, level: 0 }] }));
  const nodes: StreetNode[] = streetNodesWithConnections(positions.map((position, index) => ({
    id: `n${index}`, position, edgeIds: index === 0 ? edges.map((edge) => edge.id) : [`e${index - 1}`],
  })), edges);
  const kit = new StreetModuleKit();
  const blocks = [[7.5, 7.5], [-47.5, 7.5], [-47.5, -47.5], [7.5, -47.5]].map((origin, index) => kit.block({
    id: `b${index}`, origin: origin as Vec2, panels: [40, 40], sidewalks: [4, 4, 4, 4], finish: 'plain',
    guardrails: [{ side: 0, start: 6, segments: 1 }], parking: [{ side: 0, start: 6, slots: 1 }],
  }));
  const modules = kit.construction();
  const ground: GroundSurface[] = [...ModuleGround.cover(modules),
    ...[rect(-60, -7, 120, 14), rect(-7, -60, 14, 53), rect(-7, 7, 14, 53)]
      .map((polygon) => ({ surface: 'roadway' as const, polygon, top: 0, bottom: -0.2 }))];
  return { nodes, edges, ground, blocks, modules };
}

describe('dimensioned city crossings', () => {
  it('publishes every eligible grade arm over actual modules, curb, gutter and retained shore land', () => {
    const input = fixture();
    const plan = CityCrossings.plan(input);
    expect(plan.junctions).toHaveLength(1);
    expect(plan.junctions[0].approaches).toHaveLength(4);
    expect(plan.crossings[0].segments.every((segment) => segment.width === 3 && segment.markings.length === 3)).toBe(true);
    const walking = input.ground.filter((region) => region.surface === 'sidewalk').map((region) => region.polygon);
    for (const approach of plan.junctions[0].approaches) {
      expect(approach.distance).toBe(11);
      for (const terminal of Object.values(approach.walkingLandings)) expect(difference([terminal], walking)).toEqual([]);
      const parking = input.modules.parking!.flatMap((bay) => bay.slots);
      expect(intersection([approach.field, ...Object.values(approach.landings)], parking)).toEqual([]);
    }
    expect(Signals.build(input.nodes, input.edges, plan.junctions)).toHaveLength(4);
    CityCrossings.validate(input, JSON.parse(JSON.stringify(plan)));
    expect(CityCrossings.plan(input)).toEqual(plan);

    // authored water and excluded blocks decide which arms stay eligible
    {
      const input = fixture(), boundary = input.blocks[0].outer;
      const landExclusions = { water: [rect(20, 20, 4, 4)], blocks: [{ ownerId: 'source-block0', boundary }] };
      const ground = input.ground.flatMap((region) => difference([region.polygon], [boundary]).map((polygon) => ({ ...region, polygon })));
      expect(() => CityCrossings.plan({ ...input, ground })).toThrow('grid crossing lacks complete');
      const shore = { ...input, ground, landExclusions }, plan = CityCrossings.plan(shore);
      expect(plan.junctions).toHaveLength(1);
      expect(plan.crossings[0].segments.map((segment) => segment.edgeId)).toEqual(['e2', 'e3']);
      CityCrossings.validate(shore, JSON.parse(JSON.stringify(plan)));

      // water touching one arm removes only that arm, and water over the whole city leaves nothing
      expect(CityCrossings.plan({ ...input, landExclusions: { water: [rect(10, -1, 2, 2)], blocks: [] } })
        .crossings[0].segments.map((segment) => segment.edgeId)).toEqual(['e1', 'e2', 'e3']);
      expect(CityCrossings.plan({ ...input, ground: [], landExclusions: { water: [rect(-60, -60, 120, 120)], blocks: [] } }))
        .toEqual({ crossings: [], junctions: [] });
    }
  });

  it('places declared-angle marking fields on real roadway, clear of gutters', () => {
    const design = resolveStreetDesign();
    const layout = GridLayout.plan({ seed: 'urbe', size: { width: 1000, depth: 1000 }, profiles: design.profiles,
      diagonals: 'legacy-applied', sideAt: () => ({ profile: design.sidewalkProfiles[1], finish: 'plain' }) });
    const cuts = layout.edges.filter((edge) => edge.path[0][0] !== edge.path[1][0] && edge.path[0][1] !== edge.path[1][1]);
    const nodeIds = new Set(cuts.flatMap((edge) => [edge.from, edge.to]));
    const ground: GroundSurface[] = [...ModuleGround.cover(layout.modules), ...layout.roadway
      .map((polygon) => ({ surface: 'roadway' as const, polygon, top: 0, bottom: -0.2 }))];
    const input = { nodes: layout.nodes.filter((node) => nodeIds.has(node.id)), edges: layout.edges, ground };
    const plan = CityCrossings.plan(input);
    const roadway = ground.filter((region) => region.surface === 'roadway').map((region) => region.polygon);
    expect(plan.junctions).toHaveLength(4);
    for (const junction of plan.junctions) {
      for (const approach of junction.approaches) expect(difference([approach.field], roadway)).toEqual([]);
    }
    for (const crossing of plan.crossings) {
      for (const segment of crossing.segments) {
        expect(difference(segment.markings, roadway)).toEqual([]);
        const span = segment.roadway!, edge = layout.edges.find((edge) => edge.id === segment.edgeId)!;
        // the marking span keeps 5 cm clear of the gutter on both sides
        expect(Math.hypot(span.from[0] - span.to[0], span.from[1] - span.to[1])).toBeCloseTo(edge.width - 0.1, 8);
      }
    }
  }, 20000);

  it('rejects missing ground, physical obstacles, foreign traffic and incomplete saved records', () => {
    const input = fixture();
    const punctured = input.ground.flatMap((region) => region.surface === 'sidewalk'
      ? difference([region.polygon], [rect(10.5, 9.4, 0.05, 0.05)]).map((polygon) => ({ ...region, polygon })) : [region]);
    expect(() => CityCrossings.plan({ ...input, ground: punctured })).toThrow('grid crossing lacks complete');
    expect(() => CityCrossings.plan({ ...input, ground: input.ground.filter((region) => region.surface !== 'gutter') }))
      .toThrow('grid crossing lacks complete curb and gutter connectors');
    expect(() => CityCrossings.plan({ ...input, landExclusions: { water: [rect(NaN, 0, 2, 2)], blocks: [] } }))
      .toThrow('valid source water exclusions');
    expect(() => CityCrossings.plan({ ...input, obstacles: [rect(10, -1, 2, 2)] })).toThrow('physical obstacle');

    const foreign: StreetEdge = { ...input.edges[1], id: 'foreign', from: 'foreign0', to: 'foreign1', width: 2,
      path: [[11, -40], [11, 20]], elevationProfile: [{ distance: 0, level: 0 }, { distance: 60, level: 0 }] };
    expect(() => CityCrossings.plan({ ...input, edges: [...input.edges, foreign] })).toThrow('another grade road');
    // the same line on the highway deck is not grade traffic
    const overhead = { ...foreign, level: 8, elevationProfile: [{ distance: 0, level: 8 }, { distance: 60, level: 8 }] };
    expect(CityCrossings.plan({ ...input, edges: [...input.edges, overhead] }).crossings[0].segments).toHaveLength(4);

    const plan = CityCrossings.plan(input);
    const modified = structuredClone(plan);
    modified.junctions[0].approaches.pop();
    expect(() => CityCrossings.validate(input, modified)).toThrow('required module approaches');
    const badEdge = { ...input.edges[0], path: [[0, 0], [60, 1]] as Vec2[] };
    expect(() => CityCrossings.plan({ ...input, edges: [badEdge, ...input.edges.slice(1)] })).toThrow('straight declared-angle');

    // a through-run with no third arm is not a junction
    const through = input.edges.filter((edge) => edge.id === 'e0' || edge.id === 'e2');
    const nodes = streetNodesWithConnections(input.nodes.map((node) => ({ ...node,
      edgeIds: node.edgeIds.filter((id) => through.some((edge) => edge.id === id)) })), through);
    expect(CityCrossings.plan({ ...input, nodes, edges: through }).junctions).toEqual([]);
  });
});
