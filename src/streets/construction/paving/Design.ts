import { invalidParams } from '../../../errors';
import type { PavingDesign, PavingLayout } from './schema';

export const BANDS = ['curb', 'border', 'furnishing', 'walking', 'frontage'] as const;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export function resolvePavingDesign(input: unknown): PavingDesign {
  const design = input as PavingDesign | undefined;
  if (!design || !Array.isArray(design.layouts) || design.layouts.length === 0 || !Array.isArray(design.districtLayouts)) {
    throw invalidParams('paving design needs layouts and districtLayouts');
  }
  const layouts = new Map<string, PavingLayout>();
  for (const layout of design.layouts) {
    if (!layout || !id(layout.id) || layouts.has(layout.id) || !id(layout.familyId)
      || !Array.isArray(layout.modules) || !layout.modules.length || !layout.bands) {
      throw invalidParams('paving layout needs unique ids, a family and modules');
    }
    const modules = new Map<string, (typeof layout.modules)[number]>();
    for (const module of layout.modules) {
      if (!module || !id(module.id) || modules.has(module.id)
        || !Array.isArray(module.pitch) || module.pitch.length !== 2
        || !Array.isArray(module.joint) || module.joint.length !== 2
        || (module.baseCells !== undefined && (!Array.isArray(module.baseCells) || module.baseCells.length !== 2
          || [0, 1].some(axis => !Number.isSafeInteger(module.baseCells![axis]) || module.baseCells![axis] < 1)))
        || [0, 1].some(axis => !finite(module.pitch[axis]) || module.pitch[axis] < 0.001)
        || [0, 1].some(axis => module.pitch[axis] / (module.baseCells?.[axis] ?? 1) < 0.001
          || !finite(module.joint[axis]) || module.joint[axis] < 0
          || module.joint[axis] >= module.pitch[axis] / (module.baseCells?.[axis] ?? 1))) {
        throw invalidParams('paving module needs unique id, integer base cells, base pitches of at least 1 mm and smaller nonnegative joints');
      }
      modules.set(module.id, module);
    }
    let station: [number, number] | undefined;
    for (const band of BANDS) {
      const setting = layout.bands[band], module = setting && modules.get(setting.moduleId);
      if (!module || !finite(setting.borderWidth) || setting.borderWidth < 0) {
        throw invalidParams(`paving layout ${layout.id} has an invalid ${band} setting`);
      }
      const baseU = module.pitch[0] / (module.baseCells?.[0] ?? 1);
      if (station && (station[0] !== baseU || station[1] !== module.joint[0])) {
        throw invalidParams(`paving layout ${layout.id} band modules must share base U pitch and joint`);
      }
      station = [baseU, module.joint[0]];
      const grouping = setting.grouping;
      if (grouping !== undefined) {
        const group = grouping && modules.get(grouping.moduleId);
        if (!group || group.id === module.id || !Array.isArray(grouping.period) || grouping.period.length !== 2
          || !Array.isArray(grouping.offset) || grouping.offset.length !== 2
          || [0, 1].some(axis => {
            const base = module.baseCells?.[axis] ?? 1, count = group.baseCells?.[axis] ?? 1;
            return count % base !== 0 || group.pitch[axis] / count !== module.pitch[axis] / base
              || group.joint[axis] !== module.joint[axis] || !Number.isSafeInteger(grouping.period[axis])
              || grouping.period[axis] < count || grouping.period[axis] % count !== 0
              || !Number.isSafeInteger(grouping.offset[axis]) || grouping.offset[axis] < 0
              || grouping.offset[axis] >= grouping.period[axis] || grouping.offset[axis] % count !== 0;
          }) || [0, 1].every(axis => (group.baseCells?.[axis] ?? 1) === (module.baseCells?.[axis] ?? 1))) {
          throw invalidParams(`paving layout ${layout.id} ${band} grouping needs aligned whole groups on the same base lattice`);
        }
      }
    }
    layouts.set(layout.id, layout);
  }
  if (!layouts.has(design.defaultLayoutId)) throw invalidParams('paving defaultLayoutId is missing');
  if (design.roadwayLayoutId !== undefined && !layouts.has(design.roadwayLayoutId)) {
    throw invalidParams('paving roadwayLayoutId references an unknown layout');
  }
  const overrides = new Set<string>();
  for (const override of design.districtLayouts) {
    if (!override || !id(override.districtId) || overrides.has(override.districtId)
      || !layouts.has(override.layoutId)) {
      throw invalidParams('paving district override needs a unique district id and known layout');
    }
    overrides.add(override.districtId);
  }
  return {
    defaultLayoutId: design.defaultLayoutId,
    ...(design.roadwayLayoutId === undefined ? {} : { roadwayLayoutId: design.roadwayLayoutId }),
    districtLayouts: design.districtLayouts.map(override => ({ districtId: override.districtId, layoutId: override.layoutId })),
    layouts: design.layouts.map(layout => ({
      id: layout.id, familyId: layout.familyId,
      modules: layout.modules.map(module => ({ id: module.id, pitch: [...module.pitch], joint: [...module.joint],
        ...(module.baseCells === undefined ? {} : { baseCells: [...module.baseCells] }) })),
      bands: Object.fromEntries(BANDS.map(band => [band, { moduleId: layout.bands[band].moduleId,
        borderWidth: layout.bands[band].borderWidth,
        ...(layout.bands[band].grouping === undefined ? {} : { grouping: {
          moduleId: layout.bands[band].grouping!.moduleId,
          period: [...layout.bands[band].grouping!.period], offset: [...layout.bands[band].grouping!.offset],
        } }) }])) as PavingLayout['bands'],
    })),
  };
}
