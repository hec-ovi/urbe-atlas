import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { invalidParams, invariantFailure } from '../../../errors';
import { difference, intersection } from '../../../geom/clip';
import { transform } from '../../construction/modules/Geometry';
import { measure } from '../../construction/modules/Format';
import type { QuarterTurn } from '../../construction/modules/schema';
import type { GridLayoutPlan } from '../schema';
import type { MedianConstruction, AvenueMedian } from './schema';
import { MedianIsland, outline } from './Island';

export class AvenueMedians {
  static build(plan: GridLayoutPlan, water: Polygon[] = []): MedianConstruction {
    const out: MedianConstruction = { medians: [], definitions: [], placements: [], owners: [], frontages: [] };
    const edges = new Map(plan.edges.map(edge => [edge.id, edge]));
    const nodes = new Map(plan.nodes.map(node => [node.id, node]));
    for (const edge of plan.edges) {
      if (!edge.crossSection?.median || edge.class === 'highway') continue;
      const startPoint = edge.path[0], endPoint = edge.path.at(-1)!;
      const dx = endPoint[0] - startPoint[0], dz = endPoint[1] - startPoint[1];
      if (edge.crossSection.median.width !== 3.4 || edge.crossSection.lanes.length !== 4 || edge.path.length !== 2 || dx !== 0 && dz !== 0)
        throw invalidParams('ornamental medians require straight four-lane roads with a 3.4 m reservation', { edgeId: edge.id });
      const turn: QuarterTurn = dx > 0 ? 0 : dz > 0 ? 1 : dx < 0 ? 2 : 3;
      const clearance = (id: string) => Math.ceil((Math.max(...nodes.get(id)!.edgeIds.filter(other => other !== edge.id)
        .map(other => edges.get(other)!.width / 2 + Math.max(edges.get(other)!.sidewalk.left, edges.get(other)!.sidewalk.right)), 0) + 5) / 2) * 2;
      const start = clearance(edge.from), end = Math.floor((Math.hypot(dx, dz) - clearance(edge.to)) / 2) * 2;
      const length = measure(end - start);
      if (length < 8) continue;
      const id = `median:${edge.id}`, origin = transform([start, 0], startPoint, turn);
      const place = (point: Vec2) => transform(point, origin, turn).map(measure) as Vec2;
      const footprint = outline(length, 1.7).map(place), paving = outline(length, 1).map(place);
      if (intersection([footprint], water).length) continue;
      if (difference([footprint], plan.roadway).length) throw invariantFailure('median leaves its reserved roadway', { edgeId: edge.id });
      const ornaments: AvenueMedian['ornaments'] = [];
      for (let station = 4, i = 0; station <= length - 4; station += 12, i++) ornaments.push({ kind: i % 2 ? 'pole' : 'tree', position: place([station, 0]) });
      out.medians.push({ id, edgeId: edge.id, start, end, width: 3.4, pavedWidth: 2, curbWidth: 0.2, gutterWidth: 0.5, footprint, paving, ornaments });
      const definition = MedianIsland.build(length);
      if (!out.definitions.some(value => value.id === definition.id)) out.definitions.push(definition);
      out.placements.push({ moduleId: definition.id, blockId: id, origin, turn, count: 1, step: 2, finish: 'median' });
      out.owners.push({ id, kind: 'median', boundary: footprint });
      for (const side of [-1, 1]) {
        const startPoint = place([side < 0 ? 1.7 : length - 1.7, side * 1.7]);
        const endPoint = place([side < 0 ? length - 1.7 : 1.7, side * 1.7]);
        out.frontages.push({ id: `frontage:${id}:${side}`, ownerId: id, edgeIds: [edge.id], start: startPoint, end: endPoint,
          inward: transform([0, -side], [0, 0], turn), moduleStationOrigin: startPoint, moduleStationEnd: endPoint,
          pavedWidth: 2, curbWidth: 0.2, gutterWidth: 0.5, cornerIds: [null, null] });
      }
    }
    return out;
  }
}
