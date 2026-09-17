// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getByLabelText, getByRole } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { AtlasParams } from '../../schema/params';
import { resolveParams } from '../params/defaults';
import { ParamsPanel } from './widgets/ParamsPanel';

beforeEach(() => document.body.replaceChildren());
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

function panel() {
  const onGenerate = vi.fn<(params: AtlasParams) => void>();
  const created = new ParamsPanel({ onGenerate });
  document.body.append(created.root);
  return { onGenerate, panel: created, user: userEvent.setup() };
}

it('submits the same street design an omitted one resolves to', async () => {
  const { onGenerate, panel: created, user } = panel();
  await user.click(getByRole(created.root, 'button', { name: 'Generate city' }));
  const submitted = onGenerate.mock.lastCall![0];
  expect(resolveParams(submitted).streetDesign).toEqual(resolveParams({ seed: submitted.seed }).streetDesign);
});

it('carries street edits into the submitted parameters and blocks an unpaveable sidewalk', async () => {
  const { onGenerate, panel: created, user } = panel();
  const submit = getByRole(created.root, 'button', { name: 'Generate city' }) as HTMLButtonElement;

  const avenue = getByLabelText(created.root, 'Avenue, 4 lanes') as HTMLInputElement;
  await user.clear(avenue);
  await user.type(avenue, '3');
  const furnishing = getByLabelText(created.root, 'Furnishing') as HTMLInputElement;
  const walking = getByLabelText(created.root, 'Walking') as HTMLInputElement;
  await user.clear(furnishing);
  await user.type(furnishing, '0');
  await user.clear(walking);
  await user.type(walking, '3');
  await user.click(submit);

  const design = resolveParams(onGenerate.mock.lastCall![0]).streetDesign;
  expect(design.profiles.find((profile) => profile.classes.includes('road'))!.lanes.map((lane) => lane.width)).toEqual([3, 3, 3, 3]);
  expect(design.sidewalkProfiles[0]).toMatchObject({ border: 1, furnishing: 0, walking: 3, frontage: 0.2 });

  await user.clear(walking);
  await user.type(walking, '2');
  expect(submit.disabled).toBe(true);
  expect(created.root.textContent).toContain('must add up to 4.2 m of paving');
});
