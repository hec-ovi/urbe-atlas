import type { DistrictKind } from '../schema/params';
import type { GroundSurface, PlantingPoint, StreetEdge, Vec2 } from '../schema/blueprint';
import type { Rng } from './core/rng';
import { bounds } from './geom/polygon';
import { CityCrossingGround } from './CityCrossingGround';
import { Obstacles, Planting } from './streets/Planting';
import { transform } from './streets/construction/modules/Geometry';
import type { ModuleConstruction } from './streets/construction/modules/schema';

/** Fits sparse furniture to finished pavement and keeps openings unobstructed. */
export class CityFurniture {
  static place(input: { edges: StreetEdge[]; ground: GroundSurface[]; modules: ModuleConstruction;
    districtOf: (edgeId: string) => DistrictKind; obstacles: Obstacles; rng: Rng }): PlantingPoint[] {
    const rails = new Map(input.modules.definitions.filter(definition => definition.parts.every(part => part.role === 'guardrail'))
      .map(definition => [definition.id, bounds(definition.parts.flatMap(part => part.polygon))]));
    const occupied: Vec2[][] = [];
    input.modules.placements = input.modules.placements.filter(placement => {
      const box = rails.get(placement.moduleId);
      if (!box) return true;
      const end = box.max[0] + (placement.count - 1) * placement.step;
      const footprint: Vec2[] = [[box.min[0], box.min[1]], [end, box.min[1]], [end, box.max[1]], [box.min[0], box.max[1]]];
      const placed = footprint.map(point => transform(point, placement.origin, placement.turn));
      if (placed.some((point, index) => input.obstacles.blocksLine(point, placed[(index + 1) % placed.length]))) return false;
      occupied.push(placed);
      return true;
    });
    const pavement = new CityCrossingGround(input.ground, occupied);
    return Planting.build(input.edges, input.districtOf, input.obstacles, input.rng).filter(item => {
      const [x, z] = item.position;
      const half = item.kind === 'tree' ? 0.5 : 0.15;
      const footprint: Vec2[] = [[x - half, z - half], [x + half, z - half], [x + half, z + half], [x - half, z + half]];
      return pavement.covers(footprint, ['sidewalk']) && pavement.clear(footprint);
    });
  }
}
