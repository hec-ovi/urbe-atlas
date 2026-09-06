import type { StreetEdge, StreetNode, Vec2 } from '../../../schema/blueprint';
import type { StreetRun } from '../construction/schema/sections';
import type { BlockModuleInput, QuarterTurn, SidewalkWidth } from '../construction/modules/schema';
import { StreetModuleKit } from '../construction/modules/StreetModuleKit';
import { Rng } from '../../core/rng';
import { axis, type GridAxis } from './Axis';
import { crossSection, sideSection } from './Sections';
import type { GridLayoutInput, GridLayoutPlan } from './schema';

const rectangle = (x: number, z: number, width: number, depth: number): Vec2[] =>
  [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]];

export class GridLayout {
  static plan(input: GridLayoutInput): GridLayoutPlan {
    const x = axis(input.size.width, input.profiles, Rng.from(input.seed, 'street-columns'));
    const z = axis(input.size.depth, input.profiles, Rng.from(input.seed, 'street-rows'));
    const nodes: StreetNode[] = [];
    const edges: StreetEdge[] = [];
    const runs: StreetRun[] = [];
    const horizontal: StreetEdge[][] = z.roads.map(() => []);
    const vertical: StreetEdge[][] = x.roads.map(() => []);
    const sideAt: GridLayoutInput['sideAt'] = (point, kind) => input.perimeter
      && (point[0] < x.roads[0].position || point[0] > x.roads.at(-1)!.position
        || point[1] < z.roads[0].position || point[1] > z.roads.at(-1)!.position)
      ? input.perimeter : input.sideAt(point, kind);
    const node = (column: number, row: number) => nodes[row * x.roads.length + column];
    for (let row = 0; row < z.roads.length; row++) {
      for (let column = 0; column < x.roads.length; column++) {
        nodes.push({ id: `n${nodes.length}`, position: [x.roads[column].position, z.roads[row].position], edgeIds: [], connections: [] });
      }
    }
    const run = (road: GridAxis['roads'][number], from: StreetNode, to: StreetNode): StreetRun => {
      const value: StreetRun = { id: `sr${runs.length}`, profileId: road.profile.id, edges: [], path: [from.position, to.position],
        length: Math.abs(to.position[0] - from.position[0]) + Math.abs(to.position[1] - from.position[1]) };
      runs.push(value);
      return value;
    };
    const edge = (road: GridAxis['roads'][number], source: StreetRun, from: StreetNode, to: StreetNode): StreetEdge => {
      const kind = road.profile.lanes.length === 4 ? 'road' : 'street';
      const dx = to.position[0] - from.position[0], dz = to.position[1] - from.position[1];
      const length = Math.abs(dx) + Math.abs(dz);
      const middle: Vec2 = [(from.position[0] + to.position[0]) / 2, (from.position[1] + to.position[1]) / 2];
      const offset = road.width / 2 + 1;
      const left = sideAt([middle[0] - dz / length * offset, middle[1] + dx / length * offset], kind);
      const right = sideAt([middle[0] + dz / length * offset, middle[1] - dx / length * offset], kind);
      const section = crossSection(source.id, road.profile, sideSection(left.profile), sideSection(right.profile));
      const value: StreetEdge = { id: `e${edges.length}`, class: kind, from: from.id, to: to.id, path: [from.position, to.position],
        width: road.width, sidewalk: { left: section.sidewalks.left.geometry!.totalWidth, right: section.sidewalks.right.geometry!.totalWidth },
        districtIds: [], level: 0, elevationProfile: [{ distance: 0, level: 0 }, { distance: length, level: 0 }], crossSection: section };
      const start = source.edges.at(-1)?.end ?? 0;
      source.edges.push({ edgeId: value.id, forward: true, start, end: start + length });
      from.edgeIds.push(value.id); to.edgeIds.push(value.id); edges.push(value);
      return value;
    };
    z.roads.forEach((road, row) => {
      const source = run(road, node(0, row), node(x.roads.length - 1, row));
      for (let column = 0; column < x.panels.length; column++) horizontal[row].push(edge(road, source, node(column, row), node(column + 1, row)));
    });
    x.roads.forEach((road, column) => {
      const source = run(road, node(column, 0), node(column, z.roads.length - 1));
      for (let row = 0; row < z.panels.length; row++) vertical[column].push(edge(road, source, node(column, row), node(column, row + 1)));
    });
    nodes.forEach(value => { value.connections = [{ level: 0, edgeIds: [...value.edgeIds] }]; });

    const kit = new StreetModuleKit();
    const blocks: GridLayoutPlan['blocks'] = [];
    const rng = Rng.from(input.seed, 'street-details');
    for (let row = 0; row < z.panels.length; row++) {
      for (let column = 0; column < x.panels.length; column++) {
        const frontages = [horizontal[row][column], vertical[column + 1][row], horizontal[row + 1][column], vertical[column][row]];
        const sidewalks = frontages.map((value, side) => value.crossSection!.sidewalks[side < 2 ? 'left' : 'right'].geometry!.pavedWidth) as BlockModuleInput['sidewalks'];
        const origin: Vec2 = [x.roads[column].position + x.roads[column].width / 2 + 0.5, z.roads[row].position + z.roads[row].width / 2 + 0.5];
        const panels: [number, number] = [x.panels[column], z.panels[row]];
        const finish = input.sideAt([origin[0] + panels[0] / 2, origin[1] + panels[1] / 2], 'street').finish;
        const parking: BlockModuleInput['parking'] = [];
        const eligible = sidewalks.map((width, side) => ({ width, side: side as QuarterTurn,
          length: panels[side % 2] - sidewalks[(side + 1) % 4] - sidewalks[(side + 3) % 4] }))
          .filter(candidate => candidate.width >= 4 && candidate.length >= 28);
        if (eligible.length && rng.chance(0.15)) {
          const selected = eligible[rng.int(0, eligible.length - 1)];
          const slots = selected.length >= 36 && rng.chance(0.25) ? 3 : 2;
          parking.push({ side: selected.side, start: rng.int(3, Math.floor((selected.length - 6 - 4 - slots * 4) / 2)) * 2, slots });
        }
        const block = kit.block({ id: `b${blocks.length}`, origin, panels, sidewalks,
          finish, centerDouble: true, guardrails: rng.chance(0.35), parking });
        blocks.push({ id: block.id, outer: block.outer, interior: block.interior,
          edgeIds: frontages.map(value => value.id) as [string, string, string, string] });
      }
    }
    const roadway = z.roads.map(road => rectangle(x.min, road.position - road.width / 2, x.max - x.min, road.width));
    for (const road of x.roads) {
      for (let row = 0; row < z.panels.length; row++) {
        const start = z.roads[row].position + z.roads[row].width / 2;
        roadway.push(rectangle(road.position - road.width / 2, start, road.width, z.panels[row] + 1));
      }
    }
    const bounds = { min: [x.min, z.min] as Vec2, max: [x.max, z.max] as Vec2 };
    if (input.perimeter) kit.perimeter({ id: 'fringe', bounds,
      width: sideSection(input.perimeter.profile).geometry!.pavedWidth as SidewalkWidth, finish: input.perimeter.finish });
    return { nodes, edges, runs, blocks, modules: kit.construction(), roadway, bounds };
  }
}
