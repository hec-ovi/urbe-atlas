import type { StreetEdge, StreetNode, Vec2 } from '../../../schema/blueprint';
import type { StreetRun } from '../construction/schema/sections';
import type { BlockModuleInput, QuarterTurn, SidewalkWidth } from '../construction/modules/schema';
import { StreetModuleKit } from '../construction/modules/StreetModuleKit';
import { Rng } from '../../core/rng';
import { invalidParams } from '../../errors';
import { axis, type GridAxis } from './Axis';
import { crossSection, sideSection } from './Sections';
import { parkingSection, supportsNativeParking } from './ParkingSections';
import { LayoutPlanning } from './LayoutPlanning';
import { MedianSelection } from './MedianSelection';
import { measure, moduleSizing } from '../construction/modules/Format';
import type { GridLayoutInput, GridLayoutPlan } from './schema';

const rectangle = (x: number, z: number, width: number, depth: number): Vec2[] =>
  [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]];

export class GridLayout {
  static plan(input: GridLayoutInput): GridLayoutPlan {
    if (input.highway !== undefined && typeof input.highway !== 'boolean') throw invalidParams('highway must be boolean');
    const sizing = moduleSizing(input.moduleFormat), district = sizing.format === 'district';
    if (input.districtCenters?.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))) throw invalidParams('districtCenters require finite XZ points');
    const rim = measure(sizing.curb + sizing.gutter), gap = measure(2 * (rim + sizing.separator));
    const makeAxes = (medians: { x: number[]; z: number[] } = { x: [], z: [] }) => {
      const highwayRng = input.highway ? Rng.from(input.seed, 'highway-route') : undefined;
      const highwayAxis = highwayRng?.int(0, 1);
      const options = { blockGap: gap, centralAvenue: district };
      return {
        x: axis(input.size.width, input.profiles, Rng.from(input.seed, 'street-columns'), highwayAxis === 0 ? highwayRng : undefined, { ...options, medianIndices: medians.x }),
        z: axis(input.size.depth, input.profiles, Rng.from(input.seed, 'street-rows'), highwayAxis === 1 ? highwayRng : undefined, { ...options, medianIndices: medians.z }),
      };
    };
    let { x, z } = makeAxes();
    if (district) ({ x, z } = makeAxes(MedianSelection.select(x, z, input.districtCenters ?? [[input.size.width / 2, input.size.depth / 2]])));
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

    const highwayRunId = x.highwayIndex !== undefined ? runs[z.roads.length + x.highwayIndex].id
      : z.highwayIndex !== undefined ? runs[z.highwayIndex].id : undefined;
    const kit = new StreetModuleKit(sizing.format);
    const planning: GridLayoutPlan['planning'] = { frontages: [], corners: [], protected: [] };
    const blocks: GridLayoutPlan['blocks'] = [];
    const details = Rng.from(input.seed, 'street-details');
    for (let row = 0; row < z.panels.length; row++) {
      for (let column = 0; column < x.panels.length; column++) {
        const frontages = [horizontal[row][column], vertical[column + 1][row], horizontal[row + 1][column], vertical[column][row]];
        const origin: Vec2 = [measure(x.roads[column].position + x.roads[column].width / 2 + rim), measure(z.roads[row].position + z.roads[row].width / 2 + rim)];
        const panels: [number, number] = [x.panels[column], z.panels[row]];
        const selected = input.sideAt([origin[0] + panels[0] / 2 + sizing.separator, origin[1] + panels[1] / 2 + sizing.separator], 'street');
        const finish = selected.finish;
        if (district) {
          const section = sideSection(selected.profile);
          if (Math.abs(section.geometry!.pavedWidth - 4.2) > 1e-8 || section.geometry!.edge.gutter.width !== sizing.gutter)
            throw invalidParams('district blocks require the shared 4.2 m sidewalk profile');
          frontages.forEach((edge, side) => {
            const key = side < 2 ? 'left' : 'right';
            edge.crossSection!.sidewalks[key] = structuredClone(section);
            edge.sidewalk[key] = section.geometry!.totalWidth;
          });
        }
        const sidewalks = frontages.map((value, side) => measure(value.crossSection!.sidewalks[side < 2 ? 'left' : 'right'].geometry!.pavedWidth - sizing.separator)) as BlockModuleInput['sidewalks'];
        const rng = details.fork(`parking:${row}:${column}`);
        const parking: BlockModuleInput['parking'] = [];
        const eligible = sidewalks.map((width, side) => ({ width, side: side as QuarterTurn,
          length: panels[side % 2] - sidewalks[(side + 1) % 4] - sidewalks[(side + 3) % 4] }))
          .filter(candidate => candidate.width === (district ? 4 : 6) && candidate.length >= 32
            && frontages[candidate.side].crossSection!.runId !== highwayRunId
            && supportsNativeParking(frontages[candidate.side].crossSection!.sidewalks[candidate.side < 2 ? 'left' : 'right']));
        if (eligible.length && rng.chance(0.15)) {
          const selected = eligible[rng.int(0, eligible.length - 1)];
          const slots = selected.length >= 38 && rng.chance(0.25) ? 3 : 2;
          parking.push({ side: selected.side, start: rng.int(4, Math.floor((selected.length - 12 - slots * 6) / 2)) * 2, slots, profile: 'native' });
          const side = selected.side < 2 ? 'left' : 'right';
          const section = frontages[selected.side].crossSection!;
          section.sidewalks[side] = parkingSection(section.sidewalks[side]);
        }
        const guardrails: BlockModuleInput['guardrails'] = [];
        for (let side = 0; side < 4 && guardrails.length < 2; side++) {
          const railRng = details.fork(`rails:${row}:${column}:${side}`);
          const length = panels[side % 2] - sidewalks[(side + 1) % 4] - sidewalks[(side + 3) % 4];
          if (length < 24 || !railRng.chance(0.18)) continue;
          const segments = railRng.int(1, 3) as 1 | 2 | 3;
          const start = railRng.int(3, Math.floor((length - 6 - segments * 2) / 2)) * 2;
          guardrails.push({ side: side as QuarterTurn, start, segments });
        }
        const block = kit.block({ id: `b${blocks.length}`, origin, panels, sidewalks,
          finish, centerDouble: true, guardrails, parking });
        LayoutPlanning.add(planning, block.planning!, frontages.map(edge => [edge.id]));
        blocks.push({ id: block.id, outer: block.outer, interior: block.interior,
          edgeIds: frontages.map(value => value.id) as [string, string, string, string] });
      }
    }
    const roadway = z.roads.map(road => rectangle(x.min, road.position - road.width / 2, x.max - x.min, road.width));
    for (const road of x.roads) {
      for (let row = 0; row < z.panels.length; row++) {
        const start = z.roads[row].position + z.roads[row].width / 2;
        roadway.push(rectangle(road.position - road.width / 2, start, road.width, z.panels[row] + gap));
      }
    }
    const bounds = { min: [x.min, z.min] as Vec2, max: [x.max, z.max] as Vec2 };
    if (input.perimeter) {
      const perimeter = kit.perimeter({ id: 'fringe', bounds,
        width: measure(sideSection(input.perimeter.profile).geometry!.pavedWidth - sizing.separator) as SidewalkWidth, finish: input.perimeter.finish,
        ...(input.perimeter.exclusions?.length ? { exclusions: input.perimeter.exclusions } : {}) });
      LayoutPlanning.add(planning, perimeter.planning!, [horizontal[0], vertical.at(-1)!, horizontal.at(-1)!, vertical[0]]
        .map(edges => edges.map(edge => edge.id)));
    }
    return { planning, nodes, edges, runs, blocks, modules: kit.construction(), roadway, bounds,
      ...(highwayRunId ? { highwayRunId } : {}) };
  }
}
