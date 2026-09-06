// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getAllByRole, getByLabelText, getByRole, queryByRole, waitFor, within } from '@testing-library/dom';
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

it('starts creation with a fresh seed on each visit and exposes only the template dropdown and Generate flow', async () => {
  service(() => json({ cities: [] }));
  const first = await mount();
  await startPreview(first, '');
  const initial = (getByLabelText(first.root, 'Seed') as HTMLInputElement).value;
  expect(initial).toMatch(/^city-/);
  expect(first.root.querySelector<HTMLElement>('.workspace-creation')!.hidden).toBe(false);
  expect(getByRole(first.root, 'combobox', { name: 'Template' })).toBeTruthy();
  for (const name of ['Create', 'View', 'Save parameters', 'Save current city', 'Current city saved', 'Compact', 'Reset']) {
    expect(queryByRole(first.root, 'button', { name, hidden: true })).toBeNull();
  }
  expect(first.root.querySelector('input[type=file][aria-label="Parameter file"]')).toBeNull();
  expect(queryByRole(first.root, 'log')).toBeNull();
  first.root.remove();
  const second = await mount();
  await startPreview(second, '');
  expect((getByLabelText(second.root, 'Seed') as HTMLInputElement).value).not.toBe(initial);
});

it('keeps separate saved records, opens a city URL, reloads it and returns to creation from the logo', async () => {
  const older = record('same-seed', 'city-older');
  const newer = { ...record('same-seed', 'city-newer'), source: 'imported' as const,
    params: { seed: 'same-seed', size: { width: 800, depth: 500 } } };
  const value = blueprint('same-seed');
  const fetcher = service(url => json(url.endsWith('/blueprint') ? value : url === '/api/cities/city-older' ? older : { cities: [newer, older] }));
  let app = await mount();
  await startPreview(app, '');
  expect(getAllByRole(app.root, 'button', { name: 'Open city same-seed' })).toHaveLength(2);
  expect(app.root.textContent).toContain('800 × 500 m · Imported');
  expect(app.root.textContent).toContain('600 × 600 m · Generated');
  const seed = (getByLabelText(app.root, 'Seed') as HTMLInputElement).value;
  const row = app.root.querySelector<HTMLElement>('[data-city-id="city-older"]')!;
  await userEvent.click(within(row).getByRole('button', { name: 'Open city same-seed' }));
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
  expect(posted).toMatchObject({ seed: 'urbe', footprintShape: 'rectangle' });
  expect(posted).not.toHaveProperty('params');
});

it('cancels a pending submission by deleting the accepted job before opening any city', async () => {
  const accepted = deferred<ReturnType<typeof json>>();
  const removed = deferred<ReturnType<typeof json>>();
  const fetcher = service((url, init) => init?.method === 'POST' ? accepted.promise
    : init?.method === 'DELETE' ? removed.promise : json(url.endsWith('/blueprint') ? blueprint() : { cities: [] }));
  const app = await mount();
  const { finished } = await submit(app);
  await userEvent.click(button(app, 'Cancel'));
  expect(button(app, 'Stopping…').disabled).toBe(true);
  expectLocked(app, true);
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  accepted.resolve(json(record(), 202));
  await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => url === '/api/cities/city-1' && init?.method === 'DELETE')).toBe(true));
  expectLocked(app, true);
  removed.resolve(json({}, 204));
  await finished;
  expectLocked(app, false);
  expect(MapView.prototype.setBlueprint).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.some(([url]) => url.endsWith('/blueprint'))).toBe(false);
  expect(app.root.querySelector('[data-city-id="city-1"]')).toBeNull();
  expect(status(app)).toBe('Generation cancelled.');
  expect(button(app, 'Generate city').disabled).toBe(false);
});

it('keeps the modal locked after a failed running-job cancel and retries real server deletion', async () => {
  const stopped = deferred<ReturnType<typeof json>>();
  let attempts = 0;
  const fetcher = service((_url, init) => {
    if (init?.method === 'DELETE') return ++attempts === 1
      ? json({ error: { code: 'E_STORAGE', message: 'Server unreachable' } }, 503) : stopped.promise;
    return json(record('urbe', 'city-1', 'running'), init?.method === 'POST' ? 202 : 200);
  });
  const app = await mount();
  const { finished } = await submit(app);
  await userEvent.click(button(app, 'Cancel'));
  await waitFor(() => expect(getByRole(getByRole(app.root, 'dialog'), 'alert').textContent).toContain('Retry Cancel'));
  expectLocked(app, true);
  expect(button(app, 'Cancel').disabled).toBe(false);
  await userEvent.click(button(app, 'Cancel'));
  expect(button(app, 'Stopping…').disabled).toBe(true);
  expectLocked(app, true);
  stopped.resolve(json({}, 204));
  await finished;
  expectLocked(app, false);
  expect(attempts).toBe(2);
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => url)).toEqual(['/api/cities/city-1', '/api/cities/city-1']);
  expect(MapView.prototype.setBlueprint).not.toHaveBeenCalled();
});

it('prevents an in-flight ready status from opening a cancelled city', async () => {
  const ready = deferred<ReturnType<typeof json>>();
  const fetcher = service((url, init) => init?.method === 'DELETE' ? json({}, 204)
    : init?.method === 'POST' ? json(record('urbe', 'city-1', 'running'), 202)
    : url === '/api/cities/city-1' ? ready.promise : json(blueprint()));
  const app = await mount();
  const { finished } = await submit(app);
  await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => url === '/api/cities/city-1' && init?.method !== 'DELETE')).toBe(true));
  await userEvent.click(button(app, 'Cancel'));
  await waitFor(() => expectLocked(app, false));
  ready.resolve(json(record()));
  await finished;
  expectLocked(app, false);
  expect(MapView.prototype.setBlueprint).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.some(([url]) => url.endsWith('/blueprint'))).toBe(false);
});

it('cancels after server completion, unlocks after deletion and ignores a late blueprint response', async () => {
  const saved = deferred<ReturnType<typeof json>>();
  const stopped = deferred<ReturnType<typeof json>>();
  const fetcher = service((url, init) => init?.method === 'POST' ? json(record(), 202)
    : init?.method === 'DELETE' ? stopped.promise : url.endsWith('/blueprint') ? saved.promise : json({ cities: [] }));
  const app = await mount();
  const { finished } = await submit(app);
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url.endsWith('/blueprint'))).toBe(true));
  await userEvent.click(button(app, 'Cancel'));
  expectLocked(app, true);
  stopped.resolve(json({}, 204));
  await waitFor(() => expectLocked(app, false));
  await finished;
  expect(app.root.querySelector<HTMLElement>('.workspace-creation')!.hidden).toBe(false);
  expect(window.location.search).toBe('');
  saved.resolve(json(blueprint()));
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  expect(MapView.prototype.setBlueprint).not.toHaveBeenCalled();
  expect(window.location.search).toBe('');
  expect(status(app)).toBe('Generation cancelled.');
});

it('resumes observing saved jobs after reload without creating another job', async () => {
  const fetcher = service(url => json(url === '/api/cities' ? { cities: [record('restored', 'city-restored', 'running')] }
    : record('restored', 'city-restored')));
  const app = await mount();
  await startPreview(app, '');
  expect(button(app, 'Open city restored').disabled).toBe(true);
  await waitFor(() => expect(button(app, 'Open city restored').disabled).toBe(false), { timeout: 2500 });
  expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
});

it('retries a failed saved city with its exact recorded parameters as a new job', async () => {
  const failed = record('urbe', 'city-failed', 'failed');
  const fetcher = service((url, init) => json(init?.method === 'POST' ? record('urbe', 'city-retry')
    : url.endsWith('/blueprint') ? blueprint() : { cities: [failed] }, init?.method === 'POST' ? 202 : 200));
  const app = await mount();
  await startPreview(app, '');
  expect(app.root.textContent).toContain('E_UNSATISFIABLE: City does not fit these parameters');
  const generate = vi.spyOn(app, 'generate');
  await userEvent.click(button(app, 'Retry city urbe'));
  await generate.mock.results[0].value;
  const post = fetcher.mock.calls.find(([, init]) => init?.method === 'POST')!;
  expect(JSON.parse(String(post[1]!.body))).toMatchObject(failed.params);
  expect(window.location.search).toBe('?city=city-retry');
});

it.each([
  ['request failure', json({ error: { code: 'E_STORAGE', message: 'Storage unavailable' } }, 500), 'E_STORAGE'],
  ['invalid response', json({ id: 'bad-response' }, 202), 'Invalid city record response'],
  ['worker failure', json(record('urbe', 'city-1', 'failed'), 202), 'E_UNSATISFIABLE'],
  ['invalid progress', json({ ...record(), progress: { completed: 14, total: 13, phase: 'Invalid stage' } }, 202), 'Invalid city record response'],
])('reports %s inline and restores submission', async (_name, response, expected) => {
  service(() => response);
  const app = await mount();
  await (await submit(app)).finished;
  expect(status(app)).toContain(expected);
  expectLocked(app, false);
  expect(button(app, 'Generate city').disabled).toBe(false);
  expect(queryByRole(app.root, 'log')).toBeNull();
});

it('reports catalog outages, reloads the list and deletes only after confirmation', async () => {
  let available = false;
  const fetcher = service((_url, init) => init?.method === 'DELETE' ? json({}, 204)
    : available ? json({ cities: [record()] }) : Promise.reject(new Error('Connection refused')));
  const app = await mount();
  await startPreview(app, '');
  expect(app.root.textContent).toContain('City list unavailable: Connection refused');
  available = true;
  await userEvent.click(button(app, 'Refresh cities'));
  await waitFor(() => expect(button(app, 'Open city urbe').disabled).toBe(false));
  await userEvent.click(button(app, 'Delete city urbe'));
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  await userEvent.click(button(app, 'Confirm delete city urbe'));
  await waitFor(() => expect(app.root.querySelector('[data-city-id="city-1"]')).toBeNull());
  expect(fetcher.mock.calls.some(([url, init]) => url === '/api/cities/city-1' && init?.method === 'DELETE')).toBe(true);
});

it('preserves the displayed city when a saved city cannot open', async () => {
  const value = blueprint('local');
  service(url => url.endsWith('/blueprint') ? json({ error: { code: 'E_NOT_FOUND', message: 'City file unavailable' } }, 404)
    : json({ cities: [record()] }));
  const app = await mount();
  await app.loadBlueprint(value);
  await app.refreshCities();
  await userEvent.click(getByRole(app.root, 'link', { name: 'Atlas home' }));
  await userEvent.click(button(app, 'Open city urbe'));
  await waitFor(() => expect(status(app)).toContain('E_NOT_FOUND'));
  expect(MapView.prototype.setBlueprint).toHaveBeenCalledTimes(1);
});
