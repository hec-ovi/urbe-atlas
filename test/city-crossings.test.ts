import { describe, expect, it } from 'vitest';
import type { GroundSurface, Polygon, StreetEdge, StreetNode, Vec2 } from '../schema/blueprint';
import { CityCrossings } from '../src/CityCrossings';
import { ModuleGround } from '../src/streets/construction/modules/ModuleGround';
import { StreetModuleKit } from '../src/streets/construction/modules/StreetModuleKit';
import { crossSection, sideSection } from '../src/streets/layout/Sections';
import { streetNodesWithConnections } from '../src/streets/Connections';
import { Signals } from '../src/streets/Signals';
import { difference, intersection } from '../src/geom/clip';

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
    id: `n${index}`, position, edgeIds: index === 0 ? edges.map(edge => edge.id) : [`e${index - 1}`],
  })), edges);
  const kit = new StreetModuleKit();
  const blocks = [[7.5, 7.5], [-47.5, 7.5], [-47.5, -47.5], [7.5, -47.5]].map((origin, index) => kit.block({
    id: `b${index}`, origin: origin as Vec2, panels: [40, 40], sidewalks: [4, 4, 4, 4], finish: 'plain', guardrails: true,
    parking: [{ side: 0, start: 6, slots: 1 }],
  }));
  const modules = kit.construction();
  const ground: GroundSurface[] = [...ModuleGround.cover(modules),
    ...[rect(-60, -7, 120, 14), rect(-7, -60, 14, 53), rect(-7, 7, 14, 53)]
      .map(polygon => ({ surface: 'roadway' as const, polygon, top: 0, bottom: -0.2 }))];
  return { nodes, edges, ground, blocks, modules };
}

describe('dimensioned city crossing contract', () => {
  it('publishes every grade arm over actual modules, curb and gutter, with complete walking terminals', () => {
    const input = fixture();
    const plan = CityCrossings.plan(input);
    expect(plan.junctions).toHaveLength(1);
    expect(plan.junctions[0].approaches).toHaveLength(4);
    expect(plan.crossings[0].segments.every(segment => segment.width === 3 && segment.markings.length === 3)).toBe(true);
    const walking = input.ground.filter(region => region.surface === 'sidewalk').map(region => region.polygon);
    for (const approach of plan.junctions[0].approaches) {
      expect(approach.distance).toBe(11);
      for (const terminal of Object.values(approach.walkingLandings)) expect(difference([terminal], walking)).toEqual([]);
      const parking = input.modules.parking!.flatMap(bay => bay.slots);
      expect(intersection([approach.field, ...Object.values(approach.landings)], parking)).toEqual([]);
    }
    expect(Signals.build(input.nodes, input.edges, plan.junctions)).toHaveLength(4);
    CityCrossings.validate(input, JSON.parse(JSON.stringify(plan)));
    expect(CityCrossings.plan(input)).toEqual(plan);
  });

  it('rejects missing actual walking land and missing gutters instead of suppressing a required arm', () => {
    const input = fixture();
    const punctured = input.ground.flatMap(region => region.surface === 'sidewalk'
      ? difference([region.polygon], [rect(10.5, 9.4, 0.05, 0.05)]).map(polygon => ({ ...region, polygon })) : [region]);
    expect(() => CityCrossings.plan({ ...input, ground: punctured })).toThrow('grid crossing lacks complete');
    expect(() => CityCrossings.plan({ ...input, ground: input.ground.filter(region => region.surface !== 'gutter') }))
      .toThrow('grid crossing lacks complete curb and gutter connectors');
  });

  it('rejects physical support or ramp footprints and unconnected grade traffic entering a complete crossing', () => {
    const input = fixture();
    expect(() => CityCrossings.plan({ ...input, obstacles: [rect(10, -1, 2, 2)] })).toThrow('physical obstacle');
    const foreign: StreetEdge = { ...input.edges[1], id: 'foreign', from: 'foreign0', to: 'foreign1', width: 2,
      path: [[11, -40], [11, 20]], elevationProfile: [{ distance: 0, level: 0 }, { distance: 60, level: 0 }] };
    expect(() => CityCrossings.plan({ ...input, edges: [...input.edges, foreign] })).toThrow('another grade road');
    const overhead = { ...foreign, level: 8, elevationProfile: [{ distance: 0, level: 8 }, { distance: 60, level: 8 }] };
    expect(CityCrossings.plan({ ...input, edges: [...input.edges, overhead] }).crossings[0].segments).toHaveLength(4);
  });

  it('preserves continuation identity and rejects incomplete saved approach records', () => {
    const input = fixture(), plan = CityCrossings.plan(input);
    const modified = structuredClone(plan);
    modified.junctions[0].approaches.pop();
    expect(() => CityCrossings.validate(input, modified)).toThrow('required module approaches');
    const through = input.edges.filter(edge => edge.id === 'e0' || edge.id === 'e2');
    const nodes = streetNodesWithConnections(input.nodes.map(node => ({ ...node,
      edgeIds: node.edgeIds.filter(id => through.some(edge => edge.id === id)) })), through);
    expect(CityCrossings.plan({ ...input, nodes, edges: through }).junctions).toEqual([]);
    const badEdge = { ...input.edges[0], path: [[0, 0], [60, 1]] as Vec2[] };
    expect(() => CityCrossings.plan({ ...input, edges: [badEdge, ...input.edges.slice(1)] })).toThrow('straight orthogonal');
  });
});
