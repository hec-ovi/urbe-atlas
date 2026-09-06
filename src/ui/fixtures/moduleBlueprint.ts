import type { ModuleConstruction, ModuleRole } from '../../streets/construction/modules/schema';
import { selectionBlueprint } from './selectionBlueprint';

export function moduleBlueprint() {
  const blueprint = selectionBlueprint();
  blueprint.parcels = [];
  blueprint.volumetric.buildings = [];
  const roles: ModuleRole[] = ['panel', 'joint', 'curb', 'gutter', 'gutter-lip', 'guardrail', 'roadway', 'marking'];
  const modules: ModuleConstruction = {
    version: '1.0.0',
    definitions: [{ id: 'two-metre', parts: roles.map((role, i) => ({ role,
      polygon: [[0.006, i], [0.994, i], [0.994, i + 0.988], [0.006, i + 0.988]],
      bottom: 0.18, top: 0.2,
    })) }],
    placements: [0, 1, 2, 3].map(turn => ({ moduleId: 'two-metre', blockId: 'b0', origin: [20, 30],
      turn: turn as 0 | 1 | 2 | 3, count: 2, step: 2, finish: 'concrete' })),
  };
  blueprint.streets.construction = { version: '1.0.0', runs: [], modules };
  blueprint.volumetric.ground = ['sidewalk', 'curb', 'gutter'].map(surface => ({
    surface: surface as 'sidewalk' | 'curb' | 'gutter', moduleBlockId: 'b0',
    polygon: [[0, 0], [100, 0], [100, 100], [0, 100]], bottom: 0, top: 0.2,
  }));
  return blueprint;
}
