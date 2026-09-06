// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getByLabelText, getByRole, waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { AtlasParams } from '../../schema/params';
import { parseParams } from './components/paramsFile';
import { DEFAULT_PAVING } from './data/defaultPaving';
import { ParamsPanel } from './widgets/ParamsPanel';
import { PreviewApp } from './views/PreviewApp';
import { stubWorkspaceFetch } from './test/forms';

beforeEach(() => document.body.replaceChildren());
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

it('emits fitted metre slabs and whole two-metre groups from every new creation choice', async () => {
  const onGenerate = vi.fn<(params: AtlasParams) => void>();
  const panel = new ParamsPanel({ onGenerate, onExport: vi.fn(), onImport: vi.fn() });
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
  for (const name of ['Compact', 'City', 'Metro', 'Reset']) {
    panel.setParams({ seed: 'imported-without-paving' });
    await user.click(getByRole(panel.root, 'button', { name }));
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
] as const)('preserves %s paving through real parameter-file import, editing and export', async (_name, pavingDesign) => {
  stubWorkspaceFetch();
  const app = new PreviewApp();
  document.body.append(app.root);
  await app.ready;
  const user = userEvent.setup();
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:parameter-file');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  const expected = parseParams(JSON.stringify({ seed: 'parameter-roundtrip', size: { width: 900, depth: 700 },
    maxFloors: 12, maxFloorsByDistrict: { downtown: 9 }, features: { alleys: false },
    ...(pavingDesign ? { pavingDesign } : {}),
  }));
  await user.upload(getByLabelText(app.root, 'Parameter file'), new File([JSON.stringify(expected)], 'parameters.json', { type: 'application/json' }));
  await waitFor(() => expect((getByLabelText(app.root, 'Seed') as HTMLInputElement).value).toBe(expected.seed));
  await user.selectOptions(getByRole(app.root, 'combobox', { name: 'Building footprint' }), 'parcel');
  expected.footprintShape = 'parcel';
  await user.click(getByRole(app.root, 'button', { name: 'Save parameters' }));
  const exported = JSON.parse(await (createUrl.mock.lastCall![0] as Blob).text());
  expect(parseParams(JSON.stringify(exported))).toEqual(expected);
  if (pavingDesign) expect(exported.pavingDesign).toEqual(pavingDesign);
  else expect(exported).not.toHaveProperty('pavingDesign');

  await user.upload(getByLabelText(app.root, 'Parameter file'), new File([JSON.stringify(exported)], 'roundtrip.json', { type: 'application/json' }));
  await waitFor(() => expect(getByRole(app.root, 'log').textContent).toContain('roundtrip.json loaded'));
  await user.click(getByRole(app.root, 'button', { name: 'Save parameters' }));
  const roundtrip = JSON.parse(await (createUrl.mock.lastCall![0] as Blob).text());
  expect(roundtrip).toEqual(exported);
});
