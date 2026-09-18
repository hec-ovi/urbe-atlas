// @vitest-environment happy-dom
/** Exterior jobs: a verified complete job opens the viewer, everything else stays refused. */
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { getByRole, waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { PreviewApp } from './views/PreviewApp';
import { selectionBlueprint } from './fixtures/selectionBlueprint';
import { formPayload } from './test/forms';

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
const available = { contractVersion: '1.0', available: true, reason: null };
type Handler = (url: string, init?: RequestInit) => ReturnType<typeof json> | Promise<ReturnType<typeof json>>;

/** Mounts the displayed city with a selected parcel, the state exterior generation requires. */
async function mount(handler: Handler) {
  document.body.replaceChildren();
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const form = formPayload(url);
    return form ? json(form) : handler(url, init);
  });
  vi.stubGlobal('fetch', fetcher);
  const app = new PreviewApp();
  document.body.append(app.root);
  await app.ready;
  Object.defineProperties(app.root.querySelector('.map-wrap'), { clientWidth: { value: 600 }, clientHeight: { value: 600 } });
  await app.loadBlueprint(blueprint);
  app.resize();
  expect(getByRole(app.root, 'button', { name: 'Generate exteriors' }).closest('.workspace-creation')).toBeNull();
  expect(app.root.querySelector<HTMLElement>('.workspace-visualization')!.hidden).toBe(false);
  await userEvent.pointer({ target: app.root.querySelector('canvas')!, coords: { clientX: 300, clientY: 300 }, keys: '[MouseLeft]' });
  return { app, fetcher };
}

it('submits the displayed city only after a click and enables the viewer link after a verified complete job', async () => {
  const { app, fetcher } = await mount(async (url, init) => {
    if (init?.method === 'POST') return json(job('queued'));
    if (url.endsWith('/job-1')) return json(job());
    return json(available);
  });
  const generate = getByRole(app.root, 'button', { name: 'Generate exteriors' }) as HTMLButtonElement;
  await waitFor(() => expect(generate.disabled).toBe(false));
  expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  expect((getByRole(app.root, 'button', { name: 'Open building preview' }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(generate);
  await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
  const request = fetcher.mock.calls.find(([, init]) => init?.method === 'POST')![1]!;
  expect(JSON.parse(String(request.body))).toEqual({ blueprint });
  await waitFor(() => expect(getByRole(app.root, 'link', { name: 'Open building view' })).toBeTruthy(), { timeout: 3500 });
  const destination = new URL((getByRole(app.root, 'link', { name: 'Open building view' }) as HTMLAnchorElement).href);
  expect(destination.searchParams.get('out')).toBe('/out/atlas-exteriors-job-1');
  expect(destination.searchParams.get('parcel')).toBe('p0');
  expect(destination.searchParams.get('mode')).toBe('building');
});

it('refuses an unavailable runtime, a mismatched job, incomplete completion and a stale response', async () => {
  const { app: unavailable, fetcher } = await mount(async () => json({ contractVersion: '1.0', available: false, reason: 'Connections runtime missing' }));
  const disabled = getByRole(unavailable.root, 'button', { name: 'Generate exteriors' }) as HTMLButtonElement;
  expect(disabled.disabled).toBe(true);
  expect(unavailable.root.textContent).toContain('Connections runtime missing');
  const calls = fetcher.mock.calls.length;
  await userEvent.click(disabled);
  expect(fetcher).toHaveBeenCalledTimes(calls);

  for (const response of [
    { ...job(), blueprintHash: '0'.repeat(64) },
    { ...job(), completed: 0, completedParcels: [] },
    { ...job(), manifest: { ...manifest, seed: 'another-city' } },
  ]) {
    const { app } = await mount(async (_url, init) => json(init?.method === 'POST' ? response : available));
    await userEvent.click(getByRole(app.root, 'button', { name: 'Generate exteriors' }));
    await waitFor(() => expect(app.root.textContent).toContain('invalid or mismatched job'));
    expect((getByRole(app.root, 'button', { name: 'Open building preview' }) as HTMLButtonElement).disabled).toBe(true);
    expect(app.root.querySelector('a.inspector-open')).toBeNull();
  }

  let complete!: (response: ReturnType<typeof json>) => void;
  const { app } = await mount(async (_url, init) => init?.method === 'POST'
    ? new Promise<ReturnType<typeof json>>((resolve) => { complete = resolve; }) : json(available));
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
