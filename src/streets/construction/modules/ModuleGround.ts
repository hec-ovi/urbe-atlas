import { union } from '../../../geom/clip';
import { DIMENSIONS as D, transform } from './Geometry';
import type { ModuleConstruction, ModuleDefinition, ModuleGroundRegion } from './schema';

type LocalRegion = Omit<ModuleGroundRegion, 'blockId'>;

/** Joins each template's supporting beds once, then places its planning cover. */
export class ModuleGround {
  static cover(construction: ModuleConstruction): ModuleGroundRegion[] {
    const templates = new Map(construction.definitions.map(definition => [definition.id, this.template(definition)]));
    return construction.placements.flatMap(placement => {
      const regions = templates.get(placement.moduleId)!;
      // Straight groups tile the same rectangular bands along their complete run.
      const continuous = placement.moduleId.startsWith('straight:');
      return Array.from({ length: continuous ? 1 : placement.count }, (_, repetition) => regions.map(region => ({
        ...region, blockId: placement.blockId,
        polygon: region.polygon.map(([x, z]) => transform([
          continuous ? x * placement.count : x + repetition * placement.step, z,
        ], placement.origin, placement.turn)),
      }))).flat();
    });
  }

  private static template(definition: ModuleDefinition): LocalRegion[] {
    const beds = definition.parts.filter(part => part.role === 'joint' || part.role === 'roadway');
    const levels = {
      sidewalk: { bottom: 0, top: D.pavedTop },
      curb: { bottom: -0.03, top: D.pavedTop },
      gutter: { bottom: -0.03, top: 0 },
      roadway: { bottom: -0.2, top: 0 },
    };
    const surfaceOf = (part: typeof beds[number]): LocalRegion['surface'] => part.role === 'roadway' ? 'roadway'
      : part.bottom === 0 ? 'sidewalk' : part.top === D.bedTop ? 'curb' : 'gutter';
    return (Object.keys(levels) as LocalRegion['surface'][]).flatMap(surface =>
      union(beds.filter(part => surfaceOf(part) === surface).map(part => part.polygon))
        .map(polygon => ({ surface, polygon, ...levels[surface] })));
  }
}
