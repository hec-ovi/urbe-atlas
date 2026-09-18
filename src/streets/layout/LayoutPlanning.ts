import type { ModuleBlockPlan } from '../construction/modules/schema';
import type { LayoutPlanningData } from './schema';

/** Carries producer-owned supports through graph edits, without constructing another layout. */
export class LayoutPlanning {
  static retain(target: LayoutPlanningData, owners: ReadonlyMap<string, string>): void {
    target.frontages = target.frontages.filter(frontage => owners.has(frontage.ownerId));
    target.corners = target.corners.filter(corner => owners.has(corner.ownerId));
    target.protected = target.protected.filter(record => owners.has(record.ownerId));
    for (const record of [...target.frontages, ...target.corners, ...target.protected]) record.ownerId = owners.get(record.ownerId)!;
  }

  static add(target: LayoutPlanningData, source: ModuleBlockPlan, edgeIds: string[][]): void {
    target.corners.push(...source.corners);
    target.frontages.push(...source.frontages.map(({ side, ...frontage }) => ({ ...frontage, edgeIds: [...edgeIds[side]] })));
  }

}
