// @vitest-environment happy-dom
/** City service flows the UI contract promises: catalog, modal progress, confirmed cancellation and inline errors. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getAllByRole, getByLabelText, getByRole, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { CityRecord } from '../cities/schema';
import { selectionBlueprint } from './fixtures/selectionBlueprint';
import { formPayload } from './test/forms';
import { PreviewApp } from './views/PreviewApp';
import { MapView } from './views/MapView';
import { Map3DView } from './views/Map3DView';
import { startPreview } from './startPreview';

const stamp = '2026-09-05T10:00:00.000Z';
const json = (value: unknown, status = 200) => ({ ok: status < 400, status, json: async () => value });
function record(seed = 'urbe', id = 'city-1', status: CityRecord['status'] = 'ready'): CityRecord {
  return { id, seed, params: { seed, size: { width: 600, depth: 600 } }, stage: 'blueprint', source: 'generated', status,
    createdAt: stamp, updatedAt: stamp,
    ...(status === 'ready' ? { blueprintUrl: `/api/cities/${id}/blueprint` } : {}),
    ...(status === 'failed' ? { error: { code: 'E_UNSATISFIABLE', message: 'City does not fit these parameters' } as const } : {}),
  };
}
function blueprint(seed = 'urbe') {
  const value = selectionBlueprint();
  value.meta.seed = seed;
  value.meta.params.seed = seed;
  return value;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function service(handler: (url: string, init?: RequestInit) => ReturnType<typeof json> | Promise<ReturnType<typeof json>>) {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const form = formPayload(url);
    if (form) return json(form);
    if (url.startsWith('/api/cities')) return handler(url, init);
    return json({ contractVersion: '1.0', available: false, reason: 'Exterior runtime unavailable' });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
async function mount() {
  const app = new PreviewApp();
  document.body.append(app.root);
  await app.ready;
  return app;
}
function button(app: PreviewApp, name: string): HTMLButtonElement { return getByRole(app.root, 'button', { name }) as HTMLButtonElement; }
function status(app: PreviewApp): string { return app.root.querySelector('.workspace-message')!.textContent ?? ''; }
async function submit(app: PreviewApp) {
  const seed = getByLabelText(app.root, 'Seed');
  await userEvent.clear(seed);
  await userEvent.type(seed, 'urbe');
  const generate = vi.spyOn(app, 'generate');
  await userEvent.click(button(app, 'Generate city'));
  return { finished: generate.mock.results[0].value as Promise<void> };
}
function expectLocked(app: PreviewApp, locked: boolean) {
  for (const selector of ['.workspace-header', '.workspace-creation', '.workspace-visualization']) {
    expect(app.root.querySelector<HTMLElement>(selector)!.inert).toBe(locked);
  }
  expect(app.root.querySelector('dialog')!.open).toBe(locked);
}

beforeEach(() => {
  document.body.replaceChildren();
  history.replaceState(null, '', '/');
  vi.spyOn(MapView.prototype, 'setBlueprint').mockImplementation(() => undefined);
  vi.spyOn(Map3DView.prototype, 'setBlueprint').mockImplementation(() => undefined);
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('lists saved cities, opens one by URL, restores it on reload and deletes only after confirmation', async () => {
  const older = record('same-seed', 'city-older');
  const newer = { ...record('same-seed', 'city-newer'), source: 'imported' as const,
    params: { seed: 'same-seed', size: { width: 800, depth: 500 } } };
  const value = blueprint('same-seed');
  const fetcher = service((url, init) => init?.method === 'DELETE' ? json({}, 204)
    : json(url.endsWith('/blueprint') ? value : url === '/api/cities/city-older' ? older : { cities: [newer, older] }));
  let app = await mount();
  await startPreview(app, '');
  expect(getAllByRole(app.root, 'button', { name: 'Open city same-seed' })).toHaveLength(2);
  expect(app.root.textContent).toContain('800 × 500 m · Imported');
  expect(app.root.textContent).toContain('600 × 600 m · Generated');
  const seed = (getByLabelText(app.root, 'Seed') as HTMLInputElement).value;
  const opened = app.root.querySelector<HTMLElement>('[data-city-id="city-older"]')!;
  await userEvent.click(within(opened).getByRole('button', { name: 'Open city same-seed' }));
  await waitFor(() => expect(window.location.search).toBe('?city=city-older'));
  expect(MapView.prototype.setBlueprint).toHaveBeenCalledWith(value);

  app.root.remove();
  app = await mount();
  await startPreview(app, window.location.search);
  expect(app.root.querySelector<HTMLElement>('.workspace-visualization')!.hidden).toBe(false);
  expect(MapView.prototype.setBlueprint).toHaveBeenCalledTimes(2);
  await userEvent.click(getByRole(app.root, 'link', { name: 'Atlas home' }));
  expect(window.location.search).toBe('');
  expect(app.root.querySelector<HTMLElement>('.workspace-creation')!.hidden).toBe(false);
  expect((getByLabelText(app.root, 'Seed') as HTMLInputElement).value).not.toBe(seed);

  const removed = () => app.root.querySelector<HTMLElement>('[data-city-id="city-newer"]')!;
  await userEvent.click(within(removed()).getByRole('button', { name: 'Delete city same-seed' }));
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  await userEvent.click(within(removed()).getByRole('button', { name: 'Confirm delete city same-seed' }));
  await waitFor(() => expect(app.root.querySelector('[data-city-id="city-newer"]')).toBeNull());
  expect(fetcher.mock.calls.some(([url, init]) => url === '/api/cities/city-newer' && init?.method === 'DELETE')).toBe(true);
  expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
});

it('shows exact server progress in a modal, locks the workspace and opens the completed city', async () => {
  let job = { ...record('urbe', 'city-1', 'running'), progress: { completed: 4, total: 13, phase: 'Building parcels' } };
  const fetcher = service((url, init) => json(init?.method === 'POST' || url === '/api/cities/city-1' ? job
    : url.endsWith('/blueprint') ? blueprint() : { cities: [job] }, init?.method === 'POST' ? 202 : 200));
  const modal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
  const app = await mount();
  const { finished } = await submit(app);
  expect(modal).toHaveBeenCalledTimes(1);
  expectLocked(app, true);
  const dialog = getByRole(app.root, 'dialog', { name: 'Generating city' });
  const progress = getByRole(dialog, 'progressbar') as HTMLProgressElement;
  expect(progress.value).toBe(4);
  expect(progress.max).toBe(13);
  expect(dialog.textContent).toContain('4 / 13 stages');
  expect(getByRole(dialog, 'status').textContent).toBe('Building parcels');
  expect(document.activeElement).toBe(getByRole(dialog, 'button', { name: 'Cancel' }));
  job = { ...record(), progress: { completed: 13, total: 13, phase: 'City ready' } };
  await finished;
  expectLocked(app, false);
  expect(MapView.prototype.setBlueprint).toHaveBeenLastCalledWith(blueprint());
  expect(window.location.search).toBe('?city=city-1');
  const posted = JSON.parse(String(fetcher.mock.calls.find(([, init]) => init?.method === 'POST')![1]!.body));
  expect(posted).toMatchObject({ seed: 'urbe', size: { width: 3000, depth: 3000 } });
  expect(posted).not.toHaveProperty('params');
});

it('keeps the modal locked until deletion is confirmed and ignores a late blueprint response', async () => {
  const saved = deferred<ReturnType<typeof json>>();
  const stopped = deferred<ReturnType<typeof json>>();
  const fetcher = service((url, init) => init?.method === 'POST' ? json(record(), 202)
    : init?.method === 'DELETE' ? stopped.promise : url.endsWith('/blueprint') ? saved.promise : json({ cities: [] }));
  const app = await mount();
  const { finished } = await submit(app);
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url.endsWith('/blueprint'))).toBe(true));
  await userEvent.click(button(app, 'Cancel'));
  expect(button(app, 'Stopping…').disabled).toBe(true);
  expectLocked(app, true);
  stopped.resolve(json({}, 204));
  await waitFor(() => expectLocked(app, false));
  await finished;
  expect(fetcher.mock.calls.some(([url, init]) => url === '/api/cities/city-1' && init?.method === 'DELETE')).toBe(true);
  expect(app.root.querySelector<HTMLElement>('.workspace-creation')!.hidden).toBe(false);
  saved.resolve(json(blueprint()));
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  expect(MapView.prototype.setBlueprint).not.toHaveBeenCalled();
  expect(window.location.search).toBe('');
  expect(status(app)).toBe('Generation cancelled.');
  expect(button(app, 'Generate city').disabled).toBe(false);
});

it('reports read, worker and submission failures inline with Refresh and Retry', async () => {
  const failed = record('urbe', 'city-failed', 'failed');
  let available = false;
  let post = json(record('urbe', 'city-retry'), 202);
  const fetcher = service((url, init) => init?.method === 'POST' ? post
    : url.endsWith('/blueprint') ? json(blueprint())
    : available ? json({ cities: [failed] }) : Promise.reject(new Error('Connection refused')));
  const app = await mount();
  await startPreview(app, '');
  expect(app.root.textContent).toContain('City list unavailable: Connection refused');
  available = true;
  await userEvent.click(button(app, 'Refresh cities'));
  await waitFor(() => expect(app.root.textContent).toContain('E_UNSATISFIABLE: City does not fit these parameters'));

  await userEvent.click(button(app, 'Retry city urbe'));
  await waitFor(() => expect(window.location.search).toBe('?city=city-retry'));
  expect(JSON.parse(String(fetcher.mock.calls.find(([, init]) => init?.method === 'POST')![1]!.body))).toMatchObject(failed.params);

  await userEvent.click(getByRole(app.root, 'link', { name: 'Atlas home' }));
  post = json({ error: { code: 'E_STORAGE', message: 'Storage unavailable' } }, 500);
  await (await submit(app)).finished;
  expect(status(app)).toContain('E_STORAGE');
  expectLocked(app, false);
  expect(button(app, 'Generate city').disabled).toBe(false);
});
