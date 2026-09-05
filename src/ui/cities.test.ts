// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getAllByRole, getByLabelText, getByRole, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { CityRecord } from '../cities/schema';
import { selectionBlueprint } from './fixtures/selectionBlueprint';
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
function service(handler: (url: string, init?: RequestInit) => ReturnType<typeof json> | Promise<ReturnType<typeof json>>) {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => url.startsWith('/api/cities')
    ? handler(url, init) : json({ contractVersion: '1.0', available: false, reason: 'Exterior runtime unavailable' }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
function mount() {
  const app = new PreviewApp();
  document.body.append(app.root);
  return app;
}
function button(app: PreviewApp, name: string): HTMLButtonElement { return getByRole(app.root, 'button', { name }) as HTMLButtonElement; }

beforeEach(() => {
  document.body.replaceChildren();
  vi.spyOn(MapView.prototype, 'setBlueprint').mockImplementation(() => undefined);
  vi.spyOn(Map3DView.prototype, 'setBlueprint').mockImplementation(() => undefined);
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('restores all saved cities after reload and opens a chosen blueprint without creating a city', async () => {
  const older = record('same-seed', 'city-older');
  const newer = { ...record('same-seed', 'city-newer'), source: 'imported' as const, params: { seed: 'same-seed', size: { width: 800, depth: 500 } } };
  const value = blueprint('same-seed');
  const fetcher = service((url) => json(url.endsWith('/blueprint') ? value : { cities: [newer, older] }));
  let app = mount();
  await startPreview(app, '');
  expect(getAllByRole(app.root, 'button', { name: 'Open city same-seed' })).toHaveLength(2);
  expect(app.root.textContent).toContain('800 × 500 m · Imported');
  expect(app.root.textContent).toContain('600 × 600 m · Generated');
  app.root.remove();
  app = mount();
  await startPreview(app, '');
  const row = app.root.querySelector('[data-city-id="city-older"]')!;
  await userEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Open city same-seed' }));
  await waitFor(() => expect(MapView.prototype.setBlueprint).toHaveBeenCalledWith(value));
  expect(fetcher.mock.calls.some(([url]) => url === '/api/cities/city-older/blueprint')).toBe(true);
  expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  expect(button(app, 'Current city saved').disabled).toBe(true);
});

it('submits parameters and polls server generation while the map, parameters and tabs remain usable', async () => {
  let job = record('urbe', 'city-1', 'queued');
  const fetcher = service((url, init) => {
    if (init?.method === 'POST') return json(job, 202);
    if (url.endsWith('/blueprint')) return json(blueprint());
    if (url === '/api/cities/city-1') return json(job = record('urbe', 'city-1', 'running'));
    return json({ cities: [job] });
  });
  const app = mount();
  await app.loadBlueprint(blueprint('previous'));
  const generate = vi.spyOn(app, 'generate');
  const user = userEvent.setup();
  await user.click(button(app, 'Generate city'));
  let finished = false;
  void generate.mock.results[0].value.then(() => { finished = true; });
  expect(button(app, 'Generate city').disabled).toBe(true);
  expect((getByLabelText(app.root, 'Seed') as HTMLInputElement).disabled).toBe(false);
  await user.type(getByLabelText(app.root, 'Seed'), '-next');
  expect(button(app, 'Generate city').disabled).toBe(true);
  expect(button(app, 'Download blueprint').disabled).toBe(false);
  expect(button(app, 'Generate exteriors').closest('.tab-pane')).toBeNull();
  await user.click(button(app, 'Visualization'));
  expect(app.viewMode).toBe('3d');
  await user.click(button(app, 'Creation'));
  await waitFor(() => expect(app.root.textContent).toContain('Building blueprint on server'), { timeout: 2500 });
  expect(finished).toBe(false);
  const post = fetcher.mock.calls.find(([, init]) => init?.method === 'POST')!;
  expect(JSON.parse(String(post[1]!.body))).toMatchObject({ seed: 'urbe', footprintShape: 'rectangle' });
  expect(JSON.parse(String(post[1]!.body))).not.toHaveProperty('params');
  job = record();
  await user.click(button(app, 'Refresh cities'));
  await generate.mock.results[0].value;
  expect(finished).toBe(true);
  expect(MapView.prototype.setBlueprint).toHaveBeenLastCalledWith(blueprint());
  expect(button(app, 'Generate city').disabled).toBe(false);
  expect((getByLabelText(app.root, 'Seed') as HTMLInputElement).value).toBe('urbe-next');
});

it('keeps a city opened during generation on screen when the pending city completes', async () => {
  const saved = record('saved', 'city-saved');
  let pending = record('urbe', 'city-pending', 'queued');
  const fetcher = service((url, init) => {
    if (init?.method === 'POST') return json(pending, 202);
    if (url === '/api/cities/city-saved/blueprint') return json(blueprint('saved'));
    return json({ cities: [pending, saved] });
  });
  const app = mount();
  await startPreview(app, '');
  const generate = vi.spyOn(app, 'generate');
  await userEvent.click(button(app, 'Generate city'));
  await userEvent.click(button(app, 'Open city saved'));
  await waitFor(() => expect(MapView.prototype.setBlueprint).toHaveBeenCalledWith(blueprint('saved')));
  pending = record('urbe', 'city-pending');
  await userEvent.click(button(app, 'Refresh cities'));
  await generate.mock.results[0].value;
  expect(MapView.prototype.setBlueprint).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls.some(([url]) => url === '/api/cities/city-pending/blueprint')).toBe(false);
  expect(getByRole(app.root, 'log').textContent).toContain('Open it from Saved cities');
});

it('resumes observing unfinished saved jobs after reload', async () => {
  const fetcher = service((url) => json(url === '/api/cities' ? { cities: [record('restored', 'city-restored', 'running')] }
    : record('restored', 'city-restored')));
  const app = mount();
  await startPreview(app, '');
  expect(button(app, 'Open city restored').disabled).toBe(true);
  await waitFor(() => expect(button(app, 'Open city restored').disabled).toBe(false), { timeout: 2500 });
  expect(fetcher.mock.calls.some(([url]) => url === '/api/cities/city-restored')).toBe(true);
  expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
});

it('retains failed jobs and retries their recorded parameters as a new job', async () => {
  const failed = record('urbe', 'city-failed', 'failed');
  let accepted = false;
  const fetcher = service((url, init) => {
    if (init?.method === 'POST') { accepted = true; return json(record('urbe', 'city-retry', 'queued'), 202); }
    if (url.endsWith('/blueprint')) return json(blueprint());
    return json({ cities: accepted ? [record('urbe', 'city-retry'), failed] : [failed] });
  });
  const app = mount();
  await startPreview(app, '');
  expect(app.root.textContent).toContain('E_UNSATISFIABLE: City does not fit these parameters');
  await userEvent.click(button(app, 'Retry city urbe'));
  expect(button(app, 'Generate city').disabled).toBe(true);
  await userEvent.click(button(app, 'Refresh cities'));
  await waitFor(() => expect(button(app, 'Generate city').disabled).toBe(false));
  const post = fetcher.mock.calls.find(([, init]) => init?.method === 'POST')!;
  expect(JSON.parse(String(post[1]!.body))).toMatchObject(failed.params);
  expect(app.root.querySelectorAll('.city-row')).toHaveLength(2);
});

it.each([
  ['request failure', json({ error: { code: 'E_STORAGE', message: 'Storage unavailable' } }, 500), 'E_STORAGE'],
  ['invalid response', json({ id: 'bad-response' }, 202), 'Invalid city record response'],
])('reports a %s and restores city submission', async (_name, response, expected) => {
  service(() => response);
  const app = mount();
  await userEvent.click(button(app, 'Generate city'));
  await waitFor(() => expect(getByRole(app.root, 'log').textContent).toContain(expected));
  expect(button(app, 'Generate city').disabled).toBe(false);
});

it('reports a worker failure and releases its pending generation promise', async () => {
  const failed = record('urbe', 'city-1', 'failed');
  service((_url, init) => json(init?.method === 'POST' ? record('urbe', 'city-1', 'queued') : { cities: [failed] }));
  const app = mount();
  const generate = vi.spyOn(app, 'generate');
  await userEvent.click(button(app, 'Generate city'));
  await userEvent.click(button(app, 'Refresh cities'));
  await generate.mock.results[0].value;
  expect(getByRole(app.root, 'log').textContent).toContain('E_UNSATISFIABLE');
  expect(button(app, 'Generate city').disabled).toBe(false);
  expect(button(app, 'Retry city urbe').disabled).toBe(false);
});

it('keeps local file opening read-only until Save current city persists the exact blueprint', async () => {
  const value = { ...blueprint('imported'), extra: { retained: true } };
  const fetcher = service(() => json({ ...record('imported', 'city-imported'), source: 'imported' }, 201));
  const app = mount();
  await userEvent.upload(getByLabelText(app.root, 'Open saved blueprint'), new File([JSON.stringify(value)], 'city.json', { type: 'application/json' }));
  await waitFor(() => expect(button(app, 'Save current city').disabled).toBe(false));
  expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  await userEvent.click(button(app, 'Save current city'));
  await waitFor(() => expect(button(app, 'Current city saved').disabled).toBe(true));
  const post = fetcher.mock.calls.find(([, init]) => init?.method === 'POST')!;
  expect(post[0]).toBe('/api/cities/import');
  expect(JSON.parse(String(post[1]!.body))).toEqual(value);
  expect(button(app, 'Open city imported').disabled).toBe(false);
});

it('reports a catalog outage and reloads the list when Refresh cities is clicked', async () => {
  let available = false;
  service(() => available ? json({ cities: [record()] }) : Promise.reject(new Error('Connection refused')));
  const app = mount();
  await startPreview(app, '');
  expect(app.root.textContent).toContain('City list unavailable: Connection refused');
  available = true;
  await userEvent.click(button(app, 'Refresh cities'));
  await waitFor(() => expect(button(app, 'Open city urbe').disabled).toBe(false));
  expect(app.root.textContent).not.toContain('Connection refused');
});

it('preserves the displayed city when a catalog blueprint cannot open or the current city cannot save', async () => {
  const value = blueprint('local');
  service((url, init) => {
    if (url.endsWith('/blueprint')) return json({ error: { code: 'E_NOT_FOUND', message: 'City file unavailable' } }, 404);
    if (init?.method === 'POST') return json({ error: { code: 'E_STORAGE', message: 'Storage unavailable' } }, 500);
    return json({ cities: [record()] });
  });
  const app = mount();
  await app.loadBlueprint(value);
  await app.refreshCities();
  await userEvent.click(button(app, 'Open city urbe'));
  await waitFor(() => expect(getByRole(app.root, 'log').textContent).toContain('E_NOT_FOUND'));
  await userEvent.click(button(app, 'Save current city'));
  await waitFor(() => expect(getByRole(app.root, 'log').textContent).toContain('E_STORAGE'));
  expect(MapView.prototype.setBlueprint).toHaveBeenCalledTimes(1);
  expect(button(app, 'Download blueprint').disabled).toBe(false);
  expect(button(app, 'Save current city').disabled).toBe(false);
});

it('rejects a status for another city and reconnects through a catalog refresh', async () => {
  let ready = false;
  service((url, init) => {
    if (init?.method === 'POST') return json(record('urbe', 'city-1', 'queued'), 202);
    if (url === '/api/cities/city-1') return json(record('urbe', 'city-other'));
    if (url.endsWith('/blueprint')) return json(blueprint());
    return json({ cities: [record('urbe', 'city-1', ready ? 'ready' : 'queued')] });
  });
  const app = mount();
  const generate = vi.spyOn(app, 'generate');
  await userEvent.click(button(app, 'Generate city'));
  await waitFor(() => expect(app.root.textContent).toContain('City status belongs to another city'), { timeout: 2500 });
  expect(MapView.prototype.setBlueprint).not.toHaveBeenCalled();
  ready = true;
  await userEvent.click(button(app, 'Refresh cities'));
  await generate.mock.results[0].value;
  expect(MapView.prototype.setBlueprint).toHaveBeenCalledWith(blueprint());
  expect(button(app, 'Generate city').disabled).toBe(false);
});
