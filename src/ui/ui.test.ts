// @vitest-environment happy-dom
/** UI box contract: the workspace renders and emits what src/ui/CONTRACT.md promises. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getByLabelText, getByRole, getByText, queryByLabelText, queryByRole, waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import * as THREE from 'three';
import type { AtlasParams } from '../../schema/params';
import { resolveParams } from '../params/defaults';
import { parseParams } from './components/paramsFile';
import { GROUND_COLORS, HYDROLOGY_COLORS } from './components/colors';
import { selectionBlueprint } from './fixtures/selectionBlueprint';
import { renderBlueprint } from './fixtures/renderBlueprint';
import { moduleBlueprint } from './fixtures/moduleBlueprint';
import { defaultFilters } from './views/filters';
import { LayerToggles } from './widgets/LayerToggles';
import { ParamsPanel } from './widgets/ParamsPanel';
import { MapView } from './views/MapView';
import { Map3DView } from './views/Map3DView';
import { PreviewApp, type ManifestFetcher } from './views/PreviewApp';
import { startPreview } from './startPreview';
import { streetSurfaceRegions } from './views/StreetSurfaceRegions';
import { difference, intersection, offset } from '../geom/clip';
import { formPayload, stubWorkspaceFetch } from './test/forms';

const CANVAS = 600;

beforeEach(() => {
  document.body.replaceChildren();
  stubWorkspaceFetch();
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function mount(fetchManifest: ManifestFetcher = async () => ({ ok: false, json: async () => ({}) })): Promise<PreviewApp> {
  const app = new PreviewApp(fetchManifest);
  document.body.append(app.root);
  await app.ready;
  const wrap = app.root.querySelector('.map-wrap') as HTMLElement;
  Object.defineProperty(wrap, 'clientWidth', { value: CANVAS });
  Object.defineProperty(wrap, 'clientHeight', { value: CANVAS });
  return app;
}

function panel() {
  const onGenerate = vi.fn<(params: AtlasParams) => void>();
  const created = new ParamsPanel({ onGenerate });
  document.body.append(created.root);
  return { onGenerate, root: created.root, panel: created, user: userEvent.setup() };
}

function message(app: PreviewApp): string { return app.root.querySelector('.workspace-message')!.textContent ?? ''; }

function layersOf(view: Map3DView): Map<string, THREE.Group> {
  return (view as unknown as { layers: Map<string, THREE.Group> }).layers;
}

it('emits every contract parameter with the resolved paving and street design and preserves supplied ones through form edits', async () => {
  const { onGenerate, root, panel: created, user } = panel();
  const submit = getByRole(root, 'button', { name: 'Generate city' });
  const seed = getByLabelText(root, 'Seed') as HTMLInputElement;
  const footprint = getByRole(root, 'combobox', { name: 'Building footprint' }) as HTMLSelectElement;
  await user.clear(seed);
  await user.type(seed, 'test-9');
  expect(footprint.value).toBe('rectangle');
  await user.selectOptions(footprint, 'parcel');
  await user.click(getByLabelText(root, 'Subways'));
  await user.selectOptions(getByLabelText(root, 'Waterfront'), 'lagoon');
  await user.click(submit);

  const fresh = onGenerate.mock.lastCall![0];
  expect(fresh).toMatchObject({ seed: 'test-9', footprintShape: 'parcel', size: { width: 1000, depth: 1000 },
    districtCount: [1, 3], hydrology: { type: 'lagoon' },
    tierWeights: { poor: 0.3, mid: 0.45, rich: 0.2, high_rich: 0.05 } });
  expect(fresh.features).toEqual({ highways: true, subways: false, alleys: true, airTunnels: true, undergroundTunnels: true });
  const layout = fresh.pavingDesign!.layouts[0];
  const paving = (id: string) => layout.modules.find((item) => item.id === id)!;
  expect(layout.familyId).toBe('maintained');
  expect(paving(layout.bands.walking.moduleId)).toMatchObject({ pitch: [1, 1], joint: [0.012, 0.012] });
  expect(paving(layout.bands.walking.grouping!.moduleId)).toMatchObject({ pitch: [2, 2], joint: [0.012, 0.012], baseCells: [2, 2] });
  expect(paving(layout.bands.curb.moduleId)).toMatchObject({ pitch: [1, 0.2], joint: [0.012, 0] });
  expect(paving(layout.bands.border.moduleId)).toMatchObject({ pitch: [1, 1], joint: [0.012, 0] });
  expect(resolveParams(fresh).streetDesign).toEqual(resolveParams({ seed: fresh.seed }).streetDesign);

  await user.click(getByRole(root, 'button', { name: 'Random seed' }));
  expect(seed.value).toMatch(/^city-/);
  const randomSeed = seed.value;
  await user.selectOptions(getByRole(root, 'combobox', { name: 'Template' }), 'compact');
  expect(seed.value).toBe(randomSeed);
  expect((getByLabelText(root, 'Width') as HTMLInputElement).value).toBe('600');
  expect((getByLabelText(root, 'Highways') as HTMLInputElement).checked).toBe(false);

  const owned = structuredClone(fresh.pavingDesign!);
  fresh.pavingDesign!.layouts[0].modules[0].pitch[0] = 9;
  await user.click(submit);
  expect(onGenerate.mock.lastCall![0].pavingDesign).toEqual(owned);

  const supplied = parseParams(JSON.stringify({ seed: 'from-file', size: { width: 900, depth: 700 },
    maxFloors: 12, districtCount: [2, 3], maxFloorsByDistrict: { downtown: 9 }, landmarkFloors: { p3: 8 },
    diagonals: 'legacy-applied', diagonalCornerClearance: 4,
    tierWeights: { poor: 1 }, features: { alleys: false }, hydrology: { type: 'river' }, pavingDesign: owned }));
  created.setParams(supplied);
  await user.selectOptions(footprint, 'parcel');
  const avenue = getByLabelText(root, 'Avenue, 4 lanes') as HTMLInputElement;
  await user.clear(avenue);
  await user.type(avenue, '3');
  const furnishing = getByLabelText(root, 'Furnishing') as HTMLInputElement;
  const walking = getByLabelText(root, 'Walking') as HTMLInputElement;
  await user.clear(furnishing);
  await user.type(furnishing, '0');
  await user.clear(walking);
  await user.type(walking, '3');
  await user.click(submit);

  const kept = onGenerate.mock.lastCall![0];
  expect(parseParams(JSON.stringify(kept))).toMatchObject({ seed: 'from-file', size: { width: 900, depth: 700 },
    maxFloors: 12, districtCount: [2, 3], maxFloorsByDistrict: { downtown: 9 }, landmarkFloors: { p3: 8 },
    diagonals: 'legacy-applied', diagonalCornerClearance: 4, footprintShape: 'parcel',
    tierWeights: { poor: 1, mid: 0.45, rich: 0.2, high_rich: 0.05 },
    features: { alleys: false }, hydrology: { type: 'river' } });
  expect(kept.pavingDesign).toEqual(owned);
  const design = resolveParams(kept).streetDesign;
  expect(design.profiles.find((profile) => profile.classes.includes('road'))!.lanes.map((lane) => lane.width)).toEqual([3, 3, 3, 3]);
  expect(design.sidewalkProfiles[0]).toMatchObject({ border: 1, furnishing: 0, walking: 3, frontage: 0.2 });
});

it('blocks submission with an inline reason while a value misses its grid or a total is unmet', async () => {
  const { root, user } = panel();
  const submit = getByRole(root, 'button', { name: 'Generate city' }) as HTMLButtonElement;
  const width = getByLabelText(root, 'Width') as HTMLInputElement;
  const slider = getByLabelText(root, 'Width slider') as HTMLInputElement;
  await user.clear(width);
  await user.type(width, '0');
  expect(getByRole(root, 'alert').textContent).toContain('greater than zero');
  expect(submit.disabled).toBe(true);
  await user.clear(width);
  await user.type(width, '1200');
  expect(slider.value).toBe('1200');
  expect(submit.disabled).toBe(false);
  const walking = getByLabelText(root, 'Walking') as HTMLInputElement;
  await user.clear(walking);
  await user.type(walking, '1');
  expect(submit.disabled).toBe(true);
  expect(root.textContent).toContain('must add up to 4.2 m of paving');
});

it('emits layer filters, isolation, defaults and the independent interiors constraint', async () => {
  const onChange = vi.fn();
  const toggles = new LayerToggles(onChange);
  document.body.append(toggles.root);
  await userEvent.click(getByLabelText(toggles.root, 'Street network'));
  const allStreetsOff = { ...defaultFilters(), 'street.street': false, 'street.road': false, 'street.highway': false, 'street.alley': false };
  expect(onChange).toHaveBeenLastCalledWith(allStreetsOff);
  await userEvent.click(getByLabelText(toggles.root, 'highway'));
  expect(onChange).toHaveBeenLastCalledWith({ ...allStreetsOff, 'street.highway': true });
  await userEvent.click(getByLabelText(toggles.root, 'water'));
  expect(onChange.mock.lastCall![0]['hydrology.water']).toBe(false);
  expect(onChange.mock.lastCall![0]['hydrology.shoreline']).toBe(true);

  const transit = getByLabelText(toggles.root, 'Public transit').closest<HTMLElement>('.layer-group')!;
  await userEvent.click(getByRole(transit, 'button', { name: 'Only' }));
  const isolated = onChange.mock.lastCall![0];
  expect(isolated['transit.subway']).toBe(true);
  expect(isolated['street.highway']).toBe(false);
  expect(queryByLabelText(toggles.root, 'bus')).toBeNull();

  toggles.setInteriorCount(5);
  expect(getByText(toggles.root, '5 buildings have interiors')).toBeTruthy();
  await userEvent.click(getByLabelText(toggles.root, 'Only buildings with interiors'));
  expect(onChange.mock.lastCall![0].interiorsOnly).toBe(true);
  await userEvent.click(getByRole(toggles.root, 'button', { name: 'Defaults' }));
  expect(onChange.mock.lastCall![0]).toEqual(defaultFilters());
});

it('selects with a left click into a persistent closable popup while right clicks and drags never select or navigate', async () => {
  const app = await mount();
  await app.loadBlueprint(selectionBlueprint());
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
  const open = getByRole(popup, 'button', { name: 'Open building preview' }) as HTMLButtonElement;
  expect(open.disabled).toBe(true);
  await user.click(open);
  expect(opened).not.toHaveBeenCalled();
  await user.pointer({ target: canvas, coords: { clientX: 5, clientY: 5 } });
  expect(queryByRole(app.root, 'dialog')).toBe(popup);
  await user.click(getByRole(popup, 'button', { name: 'Close building details' }));
  expect(queryByRole(app.root, 'dialog')).toBeNull();
});

it('draws and filters the published ground, water and shoreline layers on the 2D map', () => {
  const view = new MapView();
  const context = { fillStyle: '', fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    closePath: vi.fn(), stroke: vi.fn(), arc: vi.fn(), strokeRect: vi.fn(), setLineDash: vi.fn(),
    fill: vi.fn(function (this: { fillStyle: string }) { return this.fillStyle; }) };
  vi.spyOn(view.canvas, 'getContext').mockReturnValue(context as never);
  const drawn = (color: string) => context.fill.mock.results.some((result) => result.value === color);

  view.setBlueprint(renderBlueprint());
  expect(drawn(GROUND_COLORS.roadway)).toBe(true);
  expect(drawn(HYDROLOGY_COLORS['water.river'])).toBe(true);
  expect(drawn(HYDROLOGY_COLORS.shoreline)).toBe(true);
  context.fill.mockClear();
  view.setFilters({ ...defaultFilters(), 'ground.roadway': false, 'hydrology.water': false, 'hydrology.shoreline': false });
  expect(drawn(GROUND_COLORS.roadway) || drawn(HYDROLOGY_COLORS['water.river']) || drawn(HYDROLOGY_COLORS.shoreline)).toBe(false);

  context.fill.mockClear();
  view.setFilters(defaultFilters());
  view.setBlueprint(moduleBlueprint());
  expect(drawn(GROUND_COLORS.gutter)).toBe(true);
  context.fill.mockClear();
  view.setFilters({ ...defaultFilters(), 'ground.gutter': false });
  expect(drawn(GROUND_COLORS.gutter)).toBe(false);

  // street and avenue surfaces stay disjoint and inside the published roadway ground
  const city = renderBlueprint();
  const regions = streetSurfaceRegions(city);
  const roadway = city.volumetric.ground.filter((surface) => surface.surface === 'roadway').map((surface) => surface.polygon);
  expect(regions.street.length).toBeGreaterThan(0);
  expect(regions.road.length).toBeGreaterThan(0);
  expect(offset(difference([...regions.street, ...regions.road], roadway), -0.01)).toHaveLength(0);
  expect(offset(intersection(regions.street, regions.road), -0.01)).toHaveLength(0);
});

it('defers 3D geometry until selected, builds the published systems, shares module instances and applies filters', async () => {
  const built = vi.spyOn(Map3DView.prototype, 'setBlueprint');
  const app = await mount();
  await app.loadBlueprint(selectionBlueprint());
  expect(built).not.toHaveBeenCalled();
  app.setMode('3d');
  expect(built).toHaveBeenCalledTimes(1);
  built.mockRestore();

  const view = new Map3DView();
  const blueprint = renderBlueprint();
  view.setBlueprint(blueprint);
  const layers = layersOf(view);
  expect([...layers.entries()].some(([key, group]) =>
    key.startsWith('zone.') && group.getObjectByName('floor-elevations') !== undefined)).toBe(true);
  expect(layers.get('street.highway')!.children.length).toBeGreaterThan(0);
  expect(layers.get('ground.roadway')?.getObjectByName('crossing-markings')).toBeTruthy();
  expect(layers.get('transit.subway')?.getObjectByName('station-assemblies')).toBeTruthy();
  expect(layers.get('hydrology.water')?.getObjectByName('water.river')).toBeTruthy();
  expect(layers.get('hydrology.shoreline')?.getObjectByName('shoreline-bands')).toBeTruthy();
  expect(layers.has('transit.train')).toBe(false);
  expect(layers.has('diagnostic.stationAccess')).toBe(true);
  expect(((layers.get('diagnostic.stationAccess')!.children[0] as THREE.Line).material as THREE.LineBasicMaterial).depthTest).toBe(false);

  view.setInteriorParcels([blueprint.parcels[0].id]);
  view.setFilters({ ...defaultFilters(), interiorsOnly: true, 'hydrology.water': false });
  expect(layers.get('hydrology.water')!.visible).toBe(false);
  expect(layers.get('hydrology.shoreline')!.visible).toBe(true);
  const buildings = [...layers.entries()].filter(([key]) => key.startsWith('zone.'))
    .flatMap(([, group]) => group.children.filter((child) => child.visible));
  expect(buildings.length).toBeGreaterThan(0);
  expect(buildings.every((child) => child.userData.hasInterior === true)).toBe(true);

  const modules = new Map3DView();
  modules.setBlueprint(moduleBlueprint());
  const moduleLayers = layersOf(modules);
  const meshes = [...moduleLayers.values()].flatMap((group) => group.children) as THREE.InstancedMesh[];
  expect(meshes).toHaveLength(8);
  expect(meshes.every((mesh) => mesh.isInstancedMesh && mesh.count === 8)).toBe(true);
  modules.setFilters({ ...defaultFilters(), 'ground.gutter': false, 'furniture.guardrail': false });
  expect(moduleLayers.get('ground.gutter')!.visible).toBe(false);
  expect(moduleLayers.get('furniture.guardrail')!.visible).toBe(false);
  expect(moduleLayers.get('ground.sidewalk')!.visible).toBe(true);
});

it('opens saved blueprints from a file and a same-origin URL and reports malformed data inline without replacing the city', async () => {
  vi.spyOn(MapView.prototype, 'setBlueprint').mockImplementation(() => undefined);
  vi.spyOn(Map3DView.prototype, 'setBlueprint').mockImplementation(() => undefined);
  const app = await mount();
  const user = userEvent.setup();
  const value = { ...moduleBlueprint(), retainedExtension: { coordinate: 0.123456789012345 } };
  const file = getByLabelText(app.root, 'Open saved blueprint');
  await user.upload(file, new File([JSON.stringify(value)], 'city.json', { type: 'application/json' }));
  await waitFor(() => expect(MapView.prototype.setBlueprint).toHaveBeenCalledWith(value));
  expect(Map3DView.prototype.setBlueprint).not.toHaveBeenCalled();
  await user.click(getByLabelText(app.root, 'City in 3D'));
  expect(app.viewMode).toBe('3d');
  expect(Map3DView.prototype.setBlueprint).toHaveBeenCalledWith(value);

  const malformed = moduleBlueprint();
  malformed.volumetric.ground[0].polygon = [[0, 0], [1, Number.NaN], [2, 3]];
  await app.loadBlueprint(malformed);
  expect(message(app)).toContain('blueprint.volumetric.ground[0].polygon[1][1]');
  const badModules = moduleBlueprint();
  badModules.streets.construction!.modules!.placements[0].moduleId = 'missing';
  await app.loadBlueprint(badModules);
  expect(message(app)).toContain('blueprint.streets.construction.modules.');
  await user.upload(file, new File(['{'], 'broken.json', { type: 'application/json' }));
  await waitFor(() => expect(message(app)).toContain('broken.json:'));
  expect(MapView.prototype.setBlueprint).toHaveBeenCalledTimes(1);

  const generation = vi.spyOn(app, 'generate');
  const fetcher = vi.fn(async (url: string) => {
    const form = formPayload(url);
    if (form) return { ok: true, json: async () => form };
    if (url === '/api/cities') return { ok: true, status: 200, json: async () => ({ cities: [] }) };
    if (url.endsWith('/saved.json')) return { ok: true, status: 200, json: async () => value };
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetcher);
  await startPreview(app, '?blueprint=/saved.json&view=3d');
  expect(fetcher).toHaveBeenCalledWith(new URL('/saved.json', window.location.href).href, { mode: 'same-origin', redirect: 'error' });
  expect(MapView.prototype.setBlueprint).toHaveBeenLastCalledWith(value);
  expect(Map3DView.prototype.setBlueprint).toHaveBeenLastCalledWith(value);
  fetcher.mockClear();
  await startPreview(app, '?blueprint=https://other.example/city.json');
  expect(message(app)).toContain('must use this preview origin');
  expect(fetcher.mock.calls.every(([url]) => url === '/api/cities')).toBe(true);
  await startPreview(app, '?blueprint=/missing.json');
  expect(message(app)).toContain('404');
  expect(generation).not.toHaveBeenCalled();
  expect(MapView.prototype.setBlueprint).toHaveBeenCalledTimes(2);
});

it('applies the exact interior subset of a selected assembled manifest and fails closed when it is invalid', async () => {
  const fixture = selectionBlueprint();
  const interiorId = fixture.parcels[0].id;
  const fetchManifest = vi.fn<ManifestFetcher>(async () => ({
    ok: true,
    json: async () => ({
      contractVersion: '1.0.0',
      seed: fixture.meta.seed,
      atlasVersion: fixture.meta.version,
      named: false,
      namingTheme: null,
      parcels: fixture.parcels.map((parcel) => parcel.id),
      interiors: [interiorId],
      floors: { [interiorId]: ['000'] },
    }),
  }));
  const mapIds = vi.spyOn(MapView.prototype, 'setInteriorParcels');
  const map3dIds = vi.spyOn(Map3DView.prototype, 'setInteriorParcels');
  const app = await mount(fetchManifest);
  await userEvent.type(getByLabelText(app.root, 'URL template'), 'http://localhost:5306/?out=/out/preview');
  await app.loadBlueprint(fixture);
  await waitFor(() => expect(getByText(app.root, '1 building has interiors')).toBeTruthy());
  expect(fetchManifest).toHaveBeenCalledWith('http://localhost:5306/out/preview/manifest.json');
  expect(mapIds).toHaveBeenLastCalledWith([interiorId]);
  expect(map3dIds).toHaveBeenLastCalledWith([interiorId]);
  app.root.remove();

  const invalid = await mount(async () => ({ ok: true, json: async () => ({ contractVersion: '1.0.0', interiors: ['p0'] }) }));
  await invalid.loadBlueprint(selectionBlueprint());
  await waitFor(() => expect(getByText(invalid.root, 'Assembled interior list unavailable')).toBeTruthy());
  expect(mapIds).toHaveBeenLastCalledWith([]);
});

it('shows the blueprint summary and downloads the displayed blueprint unchanged', async () => {
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:atlas');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  const app = await mount();
  const download = getByRole(app.root, 'button', { name: 'Download blueprint', hidden: true }) as HTMLButtonElement;
  expect(download.disabled).toBe(true);
  await app.loadBlueprint(renderBlueprint());
  expect(app.root.dataset.theme).toBe('dark');
  expect(getByText(app.root, 'Blueprint summary')).toBeTruthy();
  expect(getByText(app.root, /runs · \d+ ramps · \d+ supports/)).toBeTruthy();
  expect(app.root.querySelectorAll('.swatch').length).toBeGreaterThanOrEqual(13 * 4);
  expect(download.disabled).toBe(false);
  await userEvent.click(download);
  expect(click).toHaveBeenCalledTimes(1);
  expect(JSON.parse(await (createUrl.mock.lastCall![0] as Blob).text())).toEqual(renderBlueprint());
});
