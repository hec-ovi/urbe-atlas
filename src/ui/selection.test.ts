// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getByRole, queryByRole } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { CityBlueprint } from '../../schema/blueprint';
import { PreviewApp } from './views/PreviewApp';
import { Map3DView } from './views/Map3DView';
import { selectionBlueprint } from './fixtures/selectionBlueprint';
import { stubWorkspaceFetch } from './test/forms';

const blueprint = selectionBlueprint();
const parcel = blueprint.parcels[0];
beforeEach(() => stubWorkspaceFetch());
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('left click selects a persistent closable popup; right click and drags never open it or navigate', async () => {
  const app = new PreviewApp();
  document.body.append(app.root);
  await app.ready;
  const wrap = app.root.querySelector('.map-wrap')!;
  Object.defineProperties(wrap, { clientWidth: { value: 600 }, clientHeight: { value: 600 } });
  await app.loadBlueprint(blueprint);
  app.resize();
  const canvas = app.root.querySelector('canvas')!;
  const user = userEvent.setup();
  const opened = vi.spyOn(window, 'open');
  await user.pointer({ target: canvas, coords: { clientX: 300, clientY: 300 }, keys: '[MouseRight]' });
  expect(queryByRole(app.root, 'dialog')).toBeNull();
  await user.pointer([
    { target: canvas, coords: { clientX: 300, clientY: 300 }, keys: '[MouseLeft>]' },
    { coords: { clientX: 340, clientY: 300 } },
    { coords: { clientX: 300, clientY: 300 }, keys: '[/MouseLeft]' },
  ]);
  expect(queryByRole(app.root, 'dialog')).toBeNull();
  await user.pointer({ target: canvas, coords: { clientX: 300, clientY: 300 }, keys: '[MouseLeft]' });
  const popup = getByRole(app.root, 'dialog', { name: 'Building details' });
  expect(popup.closest('.sidebar')).toBeNull();
  const open = getByRole(popup, 'button', { name: 'Open building preview' }) as HTMLButtonElement;
  expect(open.disabled).toBe(true);
  await user.click(open);
  expect(opened).not.toHaveBeenCalled();
  await user.pointer({ target: canvas, coords: { clientX: 5, clientY: 5 } });
  expect(queryByRole(app.root, 'dialog')).toBe(popup);
  await user.click(getByRole(popup, 'button', { name: 'Close building details' }));
  expect(queryByRole(app.root, 'dialog')).toBeNull();
});

it('3D envelope picking uses left click and suppresses right click and orbit drags', async () => {
  const selected = vi.fn();
  const view = new Map3DView(selected);
  document.body.append(view.canvas);
  vi.spyOn(view.canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 600, 600));
  view.resize(600, 600);
  view.setBlueprint(blueprint as unknown as CityBlueprint);
  const user = userEvent.setup();
  await user.pointer({ target: view.canvas, coords: { clientX: 300, clientY: 300 }, keys: '[MouseRight]' });
  expect(selected).not.toHaveBeenCalled();
  await user.pointer([
    { target: view.canvas, coords: { clientX: 300, clientY: 300 }, keys: '[MouseLeft>]' },
    { coords: { clientX: 350, clientY: 300 } },
    { coords: { clientX: 300, clientY: 300 }, keys: '[/MouseLeft]' },
  ]);
  expect(selected).not.toHaveBeenCalled();
  await user.pointer({ target: view.canvas, coords: { clientX: 300, clientY: 300 }, keys: '[MouseLeft]' });
  expect(selected).toHaveBeenCalledWith(parcel);
});
