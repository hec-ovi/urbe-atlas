// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getByLabelText, getByRole, waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { PreviewApp } from './views/PreviewApp';
import { MapView } from './views/MapView';
import { Map3DView } from './views/Map3DView';
import { startPreview } from './startPreview';
import { formPayload, stubWorkspaceFetch } from './test/forms';

const polygon = [[0, 0], [100, 0], [100, 100], [0, 100]];
function fixture() {
  return {
    meta: { version: '0.4.0', seed: 'saved-fixture', units: 'meters', gridAngle: 0,
      boundary: polygon, bounds: { min: [0, 0], max: [100, 100] }, params: { seed: 'saved-fixture', size: { width: 100, depth: 100 } } },
    districts: [], parcels: [], blocks: [],
    streets: { nodes: [], edges: [], crossings: [], signals: [], planting: [], highwayStructures: [] },
    transit: { busStops: [], busRoutes: [], trainStations: [], trainLines: [], subwayStations: [], subwayLines: [] },
    volumetric: { buildings: [], ground: [{ surface: 'sidewalk', polygon, bottom: 0, top: 0.2 }] },
    stats: { population: 0, parcelCounts: {}, perDistrict: [] },
    retainedExtension: { coordinate: 0.123456789012345 },
  };
}

beforeEach(() => {
  document.body.replaceChildren();
  stubWorkspaceFetch();
  vi.spyOn(MapView.prototype, 'setBlueprint').mockImplementation(() => undefined);
  vi.spyOn(Map3DView.prototype, 'setBlueprint').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount() {
  const app = new PreviewApp(async () => ({ ok: false, json: async () => ({}) }));
  document.body.append(app.root);
  await app.ready;
  return app;
}

it('opens local JSON through the toolbar, retains its data and feeds both views', async () => {
  const app = await mount();
  const value = fixture();
  const user = userEvent.setup();
  await user.upload(getByLabelText(app.root, 'Open saved blueprint'), new File([JSON.stringify(value)], 'city.json', { type: 'application/json' }));
  await waitFor(() => expect(MapView.prototype.setBlueprint).toHaveBeenCalledWith(value));
  expect(Map3DView.prototype.setBlueprint).not.toHaveBeenCalled();
  await user.click(getByLabelText(app.root, 'City in 3D'));
  expect(app.viewMode).toBe('3d');
  expect(Map3DView.prototype.setBlueprint).toHaveBeenCalledWith(value);
  expect(getByRole(app.root, 'button', { name: 'Download blueprint' }).hasAttribute('disabled')).toBe(false);
});

it('starts from a same-origin saved source in 3D without generation', async () => {
  const app = await mount();
  const value = fixture();
  const fetcher = vi.fn(async (url: string) => {
    const form = formPayload(url);
    if (form) return { ok: true, json: async () => form };
    return { ok: true, json: async () => value };
  });
  vi.stubGlobal('fetch', fetcher);
  const generation = vi.spyOn(app, 'generate');
  await startPreview(app, '?blueprint=/saved.json&view=3d');
  expect(fetcher).toHaveBeenCalledWith(new URL('/saved.json', window.location.href).href, { mode: 'same-origin', redirect: 'error' });
  expect(MapView.prototype.setBlueprint).toHaveBeenCalledWith(value);
  expect(Map3DView.prototype.setBlueprint).toHaveBeenCalledWith(value);
  expect(generation).not.toHaveBeenCalled();
});

it('rejects malformed nested geometry before either renderer and keeps the loaded city', async () => {
  const app = await mount();
  const value = fixture();
  await app.loadBlueprint(value);
  expect(vi.mocked(MapView.prototype.setBlueprint).mock.calls[0][0]).toBe(value);
  const malformed = fixture();
  malformed.volumetric.ground[0].polygon = [[0, 0], [1, Number.NaN], [2, 3]];
  await app.loadBlueprint(malformed);
  expect(MapView.prototype.setBlueprint).toHaveBeenCalledTimes(1);
  expect(app.root.querySelector('.workspace-message')!.textContent).toContain('blueprint.volumetric.ground[0].polygon[1][1]');
  await userEvent.click(getByRole(app.root, 'link', { name: 'Atlas home' }));
  expect(getByRole(app.root, 'button', { name: 'Generate city' }).hasAttribute('disabled')).toBe(false);
});

it('reports unreadable JSON and URL failures without falling back to generation', async () => {
  const app = await mount();
  const user = userEvent.setup();
  await user.upload(getByLabelText(app.root, 'Open saved blueprint'), new File(['{'], 'broken.json', { type: 'application/json' }));
  await waitFor(() => expect(app.root.querySelector('.workspace-message')!.textContent).toContain('broken.json:'));
  const generation = vi.spyOn(app, 'generate');
  const fetcher = vi.fn(async (_url: string) => ({ ok: false, status: 404, json: async () => ({}) }));
  vi.stubGlobal('fetch', fetcher);
  await startPreview(app, '?blueprint=https://other.example/city.json');
  expect(fetcher.mock.calls.every(([url]) => url === '/api/cities')).toBe(true);
  expect(app.root.querySelector('.workspace-message')!.textContent).toContain('must use this preview origin');
  await startPreview(app, '?blueprint=/missing.json');
  expect(app.root.querySelector('.workspace-message')!.textContent).toContain('404');
  expect(generation).not.toHaveBeenCalled();
  expect(MapView.prototype.setBlueprint).not.toHaveBeenCalled();
});
