import type { PavingDesign } from '../../streets/construction/paving/schema';

/** Creation presets select fitted slabs on the shared metre station grid. */
export const DEFAULT_PAVING: PavingDesign = {
  defaultLayoutId: 'metre-slabs',
  districtLayouts: [],
  layouts: [{
    id: 'metre-slabs',
    familyId: 'maintained',
    modules: [
      { id: 'slab', pitch: [1, 1], joint: [0.012, 0.012] },
      { id: 'double-slab', pitch: [2, 2], joint: [0.012, 0.012], baseCells: [2, 2] },
      { id: 'curb', pitch: [1, 0.15], joint: [0.012, 0] },
      { id: 'border', pitch: [1, 0.35], joint: [0.012, 0] },
    ],
    bands: {
      curb: { moduleId: 'curb', borderWidth: 0 },
      border: { moduleId: 'border', borderWidth: 0 },
      furnishing: { moduleId: 'slab', borderWidth: 0 },
      walking: { moduleId: 'slab', borderWidth: 0,
        grouping: { moduleId: 'double-slab', period: [4, 2], offset: [0, 0] } },
      frontage: { moduleId: 'slab', borderWidth: 0 },
    },
  }],
};
