// @vitest-environment happy-dom
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { getByRole, waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { PreviewApp } from './views/PreviewApp';
import { selectionBlueprint } from './fixtures/selectionBlueprint';

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const blueprint = selectionBlueprint();
const sorted = (v: unknown): unknown => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, item]) => [key, sorted(item)])) : v;
const hash = createHash('sha256').update(JSON.stringify(sorted(blueprint))).digest('hex');
const manifest = { contractVersion: '1.0.0', seed: blueprint.meta.seed, atlasVersion: blueprint.meta.version,
  named: false, namingTheme: null, parcels: ['p0'], interiors: [], floors: { p0: ['000'] } };
function job(state = 'succeeded') {
  return { id: 'job-1', blueprintHash: hash, state, out: '/out/atlas-exteriors-job-1', total: 1,
    completed: state === 'succeeded' ? 1 : 0, completedParcels: state === 'succeeded' ? ['p0'] : [],
    manifest: state === 'succeeded' ? manifest : null, error: null };
}
const json = (value: unknown) => ({ ok: true, json: async () => value });

async function mount() {
  const app = new PreviewApp();
  document.body.append(app.root);
  Object.defineProperties(app.root.querySelector('.map-wrap'), { clientWidth: { value: 600 }, clientHeight: { value: 600 } });
  await app.loadBlueprint(blueprint);
  app.resize();
  await userEvent.pointer({ target: app.root.querySelector('canvas')!, coords: { clientX: 300, clientY: 300 }, keys: '[MouseLeft]' });
  await userEvent.click(getByRole(app.root, 'button', { name: 'Visualization' }));
  return app;
}

it('submits the displayed city only after a click and enables preview after exact completed job verification', async () => {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return json(job('queued'));
    if (url.endsWith('/job-1')) return json(job());
    return json({ contractVersion: '1.0', available: true, reason: null });
  });
  vi.stubGlobal('fetch', fetcher);
  const app = await mount();
  const button = getByRole(app.root, 'button', { name: 'Generate exteriors' }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  expect((getByRole(app.root, 'button', { name: 'Open building preview' }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(button);
  await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
  const request = fetcher.mock.calls.find(([, init]) => init?.method === 'POST')![1]!;
  expect(JSON.parse(String(request.body))).toEqual({ blueprint });
  await waitFor(() => expect(getByRole(app.root, 'link', { name: 'Open building view' })).toBeTruthy(), { timeout: 3500 });
  const link = getByRole(app.root, 'link', { name: 'Open building view' }) as HTMLAnchorElement;
  const destination = new URL(link.href);
  expect(destination.searchParams.get('out')).toBe('/out/atlas-exteriors-job-1');
  expect(destination.searchParams.get('parcel')).toBe('p0');
  expect(destination.searchParams.get('mode')).toBe('building');
  const changed = selectionBlueprint();
  changed.volumetric.buildings[0].height += 1;
  await app.loadBlueprint(changed);
  expect(app.root.querySelector('a.inspector-open')).toBeNull();
});

it('keeps generation unavailable when the server lacks its runtime', async () => {
  const fetcher = vi.fn(async () => json({ contractVersion: '1.0', available: false, reason: 'Connections runtime missing' }));
  vi.stubGlobal('fetch', fetcher);
  const app = await mount();
  const button = getByRole(app.root, 'button', { name: 'Generate exteriors' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(app.root.textContent).toContain('Connections runtime missing');
  await userEvent.click(button);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('rejects a successful job for another blueprint and keeps preview disabled', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => json(init?.method === 'POST'
    ? { ...job(), blueprintHash: '0'.repeat(64) } : { contractVersion: '1.0', available: true, reason: null })));
  const app = await mount();
  await userEvent.click(getByRole(app.root, 'button', { name: 'Generate exteriors' }));
  await waitFor(() => expect(app.root.textContent).toContain('invalid or mismatched job'));
  expect((getByRole(app.root, 'button', { name: 'Open building preview' }) as HTMLButtonElement).disabled).toBe(true);
});

it.each([
  { ...job(), completed: 0, completedParcels: [] },
  { ...job(), manifest: { ...manifest, seed: 'another-city' } },
])('rejects incomplete or mismatched exterior completion', async (response) => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => json(init?.method === 'POST'
    ? response : { contractVersion: '1.0', available: true, reason: null })));
  const app = await mount();
  await userEvent.click(getByRole(app.root, 'button', { name: 'Generate exteriors' }));
  await waitFor(() => expect(app.root.textContent).toContain('invalid or mismatched job'));
  expect(app.root.querySelector('a.inspector-open')).toBeNull();
});

it('ignores a job response after a different blueprint is loaded', async () => {
  let complete!: (response: ReturnType<typeof json>) => void;
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST'
    ? new Promise<ReturnType<typeof json>>((resolve) => { complete = resolve; })
    : json({ contractVersion: '1.0', available: true, reason: null }));
  vi.stubGlobal('fetch', fetcher);
  const app = await mount();
  await userEvent.click(getByRole(app.root, 'button', { name: 'Generate exteriors' }));
  await waitFor(() => expect(complete).toBeTypeOf('function'));
  const changed = selectionBlueprint();
  changed.volumetric.buildings[0].height += 1;
  await app.loadBlueprint(changed);
  complete(json(job()));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(app.root.textContent).not.toContain('exterior previews ready');
  expect(app.root.querySelector('a.inspector-open')).toBeNull();
});
