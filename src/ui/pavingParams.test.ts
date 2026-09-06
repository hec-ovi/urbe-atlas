// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getByRole } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { AtlasParams } from '../../schema/params';
import { parseParams } from './components/paramsFile';
import { DEFAULT_PAVING } from './data/defaultPaving';
import { ParamsPanel } from './widgets/ParamsPanel';

beforeEach(() => document.body.replaceChildren());
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

it('emits fitted metre slabs and whole two-metre groups from every new creation choice', async () => {
  const onGenerate = vi.fn<(params: AtlasParams) => void>();
  const panel = new ParamsPanel({ onGenerate });
  document.body.append(panel.root);
  const user = userEvent.setup();
  const submit = getByRole(panel.root, 'button', { name: 'Generate city' });
  await user.click(submit);
  const initial = onGenerate.mock.lastCall![0];
  const expected = structuredClone(initial.pavingDesign!);
  const layout = expected.layouts[0];
  const module = (id: string) => layout.modules.find((item) => item.id === id)!;
  expect(layout.familyId).toBe('maintained');
  expect(module(layout.bands.walking.moduleId)).toMatchObject({ pitch: [1, 1], joint: [0.012, 0.012] });
  expect(module(layout.bands.walking.grouping!.moduleId)).toMatchObject({ pitch: [2, 2], joint: [0.012, 0.012], baseCells: [2, 2] });
  expect(layout.bands.walking.grouping).toMatchObject({ period: [4, 2], offset: [0, 0] });
  expect(module(layout.bands.curb.moduleId)).toMatchObject({ pitch: [1, 0.15], joint: [0.012, 0] });
  expect(module(layout.bands.border.moduleId)).toMatchObject({ pitch: [1, 0.35], joint: [0.012, 0] });
  expect(parseParams(JSON.stringify(initial)).pavingDesign).toEqual(expected);
  expect(initial.streetDesign).toBeUndefined();

  initial.pavingDesign!.layouts[0].modules[0].pitch[0] = 9;
  await user.click(submit);
  expect(onGenerate.mock.lastCall![0].pavingDesign).toEqual(expected);
  for (const name of ['compact', 'city', 'metro']) {
    panel.setParams({ seed: 'imported-without-paving' });
    await user.selectOptions(getByRole(panel.root, 'combobox', { name: 'Template' }), name);
    await user.click(submit);
    const params = onGenerate.mock.lastCall![0];
    expect(params.pavingDesign).toEqual(expected);
    expect(params.streetDesign).toBeUndefined();
    expect(parseParams(JSON.stringify(params)).pavingDesign).toEqual(expected);
  }
});

function customPaving(): NonNullable<AtlasParams['pavingDesign']> {
  const design = structuredClone(DEFAULT_PAVING);
  design.layouts[0].familyId = 'caller-finish';
  design.layouts[0].bands.walking.grouping!.period = [6, 4];
  design.layouts[0].bands.walking.grouping!.offset = [2, 0];
  design.layouts[0].bands.walking.borderWidth = 0.06;
  design.roadwayLayoutId = design.defaultLayoutId;
  return design;
}

it.each([
  ['default', structuredClone(DEFAULT_PAVING)],
  ['custom', customPaving()],
  ['omitted', undefined],
] as const)('preserves %s paving through supplied parameters, form edits and Generate', async (_name, pavingDesign) => {
  const onGenerate = vi.fn<(params: AtlasParams) => void>();
  const panel = new ParamsPanel({ onGenerate });
  document.body.append(panel.root);
  const expected = parseParams(JSON.stringify({ seed: 'parameter-roundtrip', size: { width: 900, depth: 700 },
    maxFloors: 12, maxFloorsByDistrict: { downtown: 9 }, features: { alleys: false },
    ...(pavingDesign ? { pavingDesign } : {}),
  }));
  panel.setParams(expected);
  await userEvent.selectOptions(getByRole(panel.root, 'combobox', { name: 'Building footprint' }), 'parcel');
  expected.footprintShape = 'parcel';
  await userEvent.click(getByRole(panel.root, 'button', { name: 'Generate city' }));
  const emitted = onGenerate.mock.lastCall![0];
  expect(parseParams(JSON.stringify(emitted))).toEqual(expected);
  if (pavingDesign) expect(emitted.pavingDesign).toEqual(pavingDesign);
  else expect(emitted).not.toHaveProperty('pavingDesign');
});
