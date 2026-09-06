// @vitest-environment happy-dom
/** UI box contract: components render and emit the events src/ui/CONTRACT.md lists. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getByLabelText, getByRole, getByText, waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import * as THREE from 'three';
import { selectionBlueprint } from './fixtures/selectionBlueprint';
import { renderBlueprint } from './fixtures/renderBlueprint';
import { LegendWidget } from './widgets/LegendWidget';
import { defaultFilters } from './views/filters';
import { LayerToggles } from './widgets/LayerToggles';
import { ParamsPanel } from './widgets/ParamsPanel';
import { MapView, DEFAULT_LAYERS } from './views/MapView';
import { PreviewApp, type ManifestFetcher } from './views/PreviewApp';
import { stubWorkspaceFetch } from './test/forms';
import { Map3DView } from './views/Map3DView';
import { streetSurfaceRegions } from './views/StreetSurfaceRegions';
import { difference, intersection, offset } from '../geom/clip';

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

function expectUniqueNondegenerateFaces(mesh: THREE.Mesh): void {
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.index!;
  const point = (vertex: number): THREE.Vector3 => new THREE.Vector3(
    position.getX(vertex), position.getY(vertex), position.getZ(vertex),
  );
  const faces = new Set<string>();
  for (let offset = 0; offset < index.count; offset += 3) {
    const vertices = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)].map(point);
    expect(new THREE.Triangle(vertices[0], vertices[1], vertices[2]).getArea()).toBeGreaterThan(1e-9);
    const key = vertices.map((vertex) => vertex.toArray().join(',')).sort().join('|');
    expect(faces.has(key)).toBe(false);
    faces.add(key);
  }
}

describe('LegendWidget', () => {
  it('shows every parcel type with all four tier swatches', () => {
    const legend = new LegendWidget();
    document.body.append(legend.root);
    expect(getByText(legend.root, 'coffee shop')).toBeTruthy();
    expect(getByText(legend.root, 'residential')).toBeTruthy();
    expect(getByText(legend.root, 'alley')).toBeTruthy();
    expect(getByText(legend.root, 'water')).toBeTruthy();
    expect(getByText(legend.root, 'shoreline')).toBeTruthy();
    expect(legend.root.querySelectorAll('.swatch').length).toBeGreaterThanOrEqual(13 * 4);
  });
});

describe('LayerToggles', () => {
  it('emits the updated layer set when a checkbox changes', async () => {
    const onChange = vi.fn();
    const toggles = new LayerToggles(onChange);
    document.body.append(toggles.root);
    // the group row switches every street class; one row switches one class
    await userEvent.click(getByLabelText(toggles.root, 'Street network'));
    const allStreetsOff = { ...defaultFilters(), 'street.street': false, 'street.road': false, 'street.highway': false, 'street.alley': false };
    expect(onChange).toHaveBeenLastCalledWith(allStreetsOff);
    await userEvent.click(getByLabelText(toggles.root, 'highway'));
    expect(onChange).toHaveBeenLastCalledWith({ ...allStreetsOff, 'street.highway': true });
    await userEvent.click(getByRole(toggles.root, 'button', { name: 'Only highway' }));
    const highwayOnly = onChange.mock.lastCall![0];
    expect(highwayOnly['street.highway']).toBe(true);
    expect(Object.entries(highwayOnly).filter(([key]) => key !== 'street.highway').every(([, visible]) => visible === false)).toBe(true);
  });

  it('supports global visibility reset and one-group isolation', async () => {
    const onChange = vi.fn();
    const toggles = new LayerToggles(onChange);
    document.body.append(toggles.root);
    await userEvent.click(getByRole(toggles.root, 'button', { name: 'Hide all' }));
    expect(Object.values(onChange.mock.lastCall![0]).every((visible) => visible === false)).toBe(true);
    const transit = getByLabelText(toggles.root, 'Public transit').closest<HTMLElement>('.layer-group')!;
    await userEvent.click(getByRole(transit, 'button', { name: 'Only' }));
    const isolated = onChange.mock.lastCall![0];
    expect(isolated['transit.bus']).toBe(true);
    expect(isolated['transit.train']).toBe(true);
    expect(isolated['street.highway']).toBe(false);
  });

  it('exposes an independent assembled-interiors constraint and its exact count', async () => {
    const onChange = vi.fn();
    const toggles = new LayerToggles(onChange);
    document.body.append(toggles.root);
    toggles.setInteriorCount(5);
    expect(getByText(toggles.root, '5 buildings have interiors')).toBeTruthy();
    await userEvent.click(getByLabelText(toggles.root, 'Only buildings with interiors'));
    expect(onChange.mock.lastCall![0].interiorsOnly).toBe(true);
    expect(onChange.mock.lastCall![0]['street.highway']).toBe(true);
    await userEvent.click(getByRole(toggles.root, 'button', { name: 'Defaults' }));
    expect(onChange.mock.lastCall![0].interiorsOnly).toBe(false);
  });

  it('toggles water surfaces and shorelines independently', async () => {
    const onChange = vi.fn();
    const toggles = new LayerToggles(onChange);
    document.body.append(toggles.root);
    await userEvent.click(getByLabelText(toggles.root, 'water'));
    expect(onChange.mock.lastCall![0]['hydrology.water']).toBe(false);
    expect(onChange.mock.lastCall![0]['hydrology.shoreline']).toBe(true);
    await userEvent.click(getByLabelText(toggles.root, 'shoreline'));
    expect(onChange.mock.lastCall![0]['hydrology.shoreline']).toBe(false);
  });
});

describe('ParamsPanel', () => {
  const events = () => ({ onGenerate: vi.fn() });

  it('emits every contract parameter on Generate', async () => {
    const handlers = events();
    const panel = new ParamsPanel(handlers);
    document.body.append(panel.root);
    const seed = getByLabelText(panel.root, 'Seed');
    await userEvent.clear(seed);
    await userEvent.type(seed, 'test-9');
    const footprint = getByRole(panel.root, 'combobox', { name: 'Building footprint' }) as HTMLSelectElement;
    expect(footprint.value).toBe('rectangle');
    await userEvent.selectOptions(footprint, 'parcel');
    await userEvent.click(getByLabelText(panel.root, 'Subways'));
    await userEvent.selectOptions(getByLabelText(panel.root, 'Waterfront'), 'lagoon');
    await userEvent.click(getByText(panel.root, 'Generate city'));
    expect(handlers.onGenerate).toHaveBeenCalledTimes(1);
    const params = handlers.onGenerate.mock.calls[0][0];
    expect(params.seed).toBe('test-9');
    expect(params.footprintShape).toBe('parcel');
    expect(params.size).toEqual({ width: 1000, depth: 1000 });
    expect(params.districtCount).toEqual([1, 3]);
    expect(params.hydrology).toEqual({ type: 'lagoon' });
    expect(params.tierWeights).toEqual({ poor: 0.3, mid: 0.45, rich: 0.2, high_rich: 0.05 });
    expect(params.features).toEqual({
      highways: true,
      trains: true,
      subways: false,
      alleys: true,
      airTunnels: true,
      undergroundTunnels: true,
    });
  });

  it('preserves supplied district caps and weights in generated parameters', async () => {
    const handlers = events();
    const panel = new ParamsPanel(handlers);
    document.body.append(panel.root);
    panel.setParams({
      seed: 'from-file',
      size: { width: 900, depth: 700 },
      maxFloors: 12,
      districtCount: [2, 3],
      maxFloorsByDistrict: { downtown: 9 },
      tierWeights: { poor: 1 },
      features: { alleys: false },
      hydrology: { type: 'river' },
    });
    await userEvent.click(getByText(panel.root, 'Generate city'));
    const params = handlers.onGenerate.mock.calls[0][0];
    expect(params.seed).toBe('from-file');
    expect(params.size).toEqual({ width: 900, depth: 700 });
    expect(params.maxFloors).toBe(12);
    expect(params.districtCount).toEqual([2, 3]);
    expect(params.maxFloorsByDistrict).toEqual({ downtown: 9 });
    expect(params.tierWeights).toEqual({ poor: 1, mid: 0.45, rich: 0.2, high_rich: 0.05 });
    expect(params.features.alleys).toBe(false);
    expect(params.features.trains).toBe(true);
    expect(params.hydrology).toEqual({ type: 'river' });
  });

  it('keeps slider and exact value synchronized and blocks invalid input', async () => {
    const handlers = events();
    const panel = new ParamsPanel(handlers);
    document.body.append(panel.root);
    const width = getByLabelText(panel.root, 'Width') as HTMLInputElement;
    const slider = getByLabelText(panel.root, 'Width slider') as HTMLInputElement;
    await userEvent.clear(width);
    await userEvent.type(width, '0');
    expect(getByRole(panel.root, 'alert').textContent).toContain('greater than zero');
    expect((getByRole(panel.root, 'button', { name: 'Generate city' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.clear(width);
    await userEvent.type(width, '1200');
    expect(slider.value).toBe('1200');
    expect((getByRole(panel.root, 'button', { name: 'Generate city' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('creates a new seed and applies a preset without changing it', async () => {
    const panel = new ParamsPanel(events());
    document.body.append(panel.root);
    const seed = getByLabelText(panel.root, 'Seed') as HTMLInputElement;
    await userEvent.click(getByRole(panel.root, 'button', { name: 'Random seed' }));
    expect(seed.value).toMatch(/^city-/);
    const generatedSeed = seed.value;
    const footprint = getByRole(panel.root, 'combobox', { name: 'Building footprint' }) as HTMLSelectElement;
    await userEvent.selectOptions(footprint, 'parcel');
    await userEvent.selectOptions(getByRole(panel.root, 'combobox', { name: 'Template' }), 'compact');
    expect(seed.value).toBe(generatedSeed);
    expect((getByLabelText(panel.root, 'Width') as HTMLInputElement).value).toBe('600');
    expect((getByLabelText(panel.root, 'Highways') as HTMLInputElement).checked).toBe(false);
    expect(footprint.value).toBe('rectangle');
  });

  it('shows generation status and disables only submission while busy', async () => {
    const panel = new ParamsPanel(events());
    document.body.append(panel.root);
    const seed = getByLabelText(panel.root, 'Seed') as HTMLInputElement;
    const submit = getByRole(panel.root, 'button', { name: 'Generate city' }) as HTMLButtonElement;
    panel.setBusy(true);
    expect(seed.disabled).toBe(false);
    await userEvent.type(seed, '-next');
    expect(submit.disabled).toBe(true);
    panel.setBusy(false);
    expect(submit.disabled).toBe(false);
    panel.setStatus('E_INVALID_PARAMS: seed missing');
    expect(panel.root.textContent).toContain('E_INVALID_PARAMS');
  });
});

describe('MapView', () => {
  it('accepts layers and resize without a blueprint', () => {
    const view = new MapView();
    view.setLayers({ ...DEFAULT_LAYERS, transit: false });
    view.resize(400, 300);
    expect(view.canvas.width).toBe(400);
  });

  it('selects a map feature from a click', async () => {
    const blueprint = selectionBlueprint();
    const selected = vi.fn();
    const view = new MapView(selected);
    document.body.append(view.canvas);
    view.setBlueprint(blueprint);
    view.resize(CANVAS, CANVAS);
    await userEvent.click(view.canvas);
    expect(selected).not.toHaveBeenCalled();
    await userEvent.pointer({ target: view.canvas, coords: { clientX: 300, clientY: 300 }, keys: '[MouseLeft]' });
    expect(selected).toHaveBeenCalledWith({ kind: 'parcel', parcel: blueprint.parcels[0] });
  });

  it('removes shell parcels from hit testing when the interiors-only filter is active', async () => {
    const blueprint = selectionBlueprint();
    const selected = vi.fn();
    const view = new MapView(selected);
    document.body.append(view.canvas);
    view.setBlueprint(blueprint);
    view.resize(CANVAS, CANVAS);
    const target = blueprint.parcels[0];
    view.setInteriorParcels([target.id]);
    view.setFilters({ ...defaultFilters(), interiorsOnly: true });
    await userEvent.pointer({ target: view.canvas, coords: { clientX: 300, clientY: 300 }, keys: '[MouseLeft]' });
    expect(selected).toHaveBeenCalledWith({ kind: 'parcel', parcel: target });
    selected.mockClear();
    view.setInteriorParcels([]);
    await userEvent.pointer({ target: view.canvas, coords: { clientX: 300, clientY: 300 }, keys: '[MouseLeft]' });
    expect(selected).not.toHaveBeenCalled();
  });

  it('draws the exact water surface and shoreline band on independent layers', () => {
    const blueprint = renderBlueprint();
    const view = new MapView();
    vi.spyOn(view.canvas, 'getContext').mockReturnValue({
      fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
      fill: vi.fn(), stroke: vi.fn(), arc: vi.fn(), strokeRect: vi.fn(), setLineDash: vi.fn(),
    } as never);
    const polygon = vi.spyOn(view as never, 'polygon');
    view.setBlueprint(blueprint);
    const body = blueprint.hydrology!.bodies[0];
    expect(polygon.mock.calls.some((call) => call[1] === body.surfaces[0])).toBe(true);
    expect(polygon.mock.calls.some((call) => call[1] === body.shorelines[0].band[0])).toBe(true);
    polygon.mockClear();
    view.setFilters({ ...defaultFilters(), 'hydrology.water': false, 'hydrology.shoreline': false });
    expect(polygon.mock.calls.some((call) => call[1] === body.surfaces[0] || call[1] === body.shorelines[0].band[0])).toBe(false);
  });
});

describe('3D street surfaces', () => {
  it('clips the reported city street classes to disjoint roadway regions', () => {
    const blueprint = renderBlueprint();
    const regions = streetSurfaceRegions(blueprint);
    const roadway = blueprint.volumetric.ground
      .filter((surface) => surface.surface === 'roadway')
      .map((surface) => surface.polygon);
    expect(regions.street.length).toBeGreaterThan(0);
    expect(regions.road.length).toBeGreaterThan(0);
    expect(offset(difference([...regions.street, ...regions.road], roadway), -0.01)).toHaveLength(0);
    expect(offset(intersection(regions.street, regions.road), -0.01)).toHaveLength(0);
  });
});

describe('PreviewApp', () => {
  it('defers 3D geometry until that view is selected', async () => {
    const built3d = vi.spyOn(Map3DView.prototype, 'setBlueprint');
    const app = await mount();
    await app.loadBlueprint(selectionBlueprint());
    expect(built3d).not.toHaveBeenCalled();
    app.setMode('3d');
    expect(built3d).toHaveBeenCalledTimes(1);
    built3d.mockRestore();
  });

  it('builds the published 3D systems without invalid geometry', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = new Map3DView();
    const blueprint = renderBlueprint();
    expect(blueprint.transit.trainStations.length).toBeGreaterThan(0);
    expect(blueprint.transit.subwayStations.length).toBeGreaterThan(0);
    view.setBlueprint(blueprint);
    const layers = (view as unknown as {
      layers: Map<string, THREE.Group>;
    }).layers;
    expect([...layers.entries()].some(([key, group]) =>
      key.startsWith('zone.') && group.getObjectByName('floor-elevations') !== undefined)).toBe(true);
    expect(layers.has('diagnostic.highwayCenterlines')).toBe(blueprint.streets.highwayStructures.length > 0);
    expect(layers.has('diagnostic.highwaySupports')).toBe(blueprint.streets.highwayStructures.some((item) => item.supports.length > 0));
    expect(layers.has('diagnostic.stationAccess')).toBe(blueprint.transit.subwayStations.some((item) => item.accessPaths.length > 0));
    const accessOverlay = layers.get('diagnostic.stationAccess')?.children[0] as THREE.Line | undefined;
    expect((accessOverlay?.material as THREE.LineBasicMaterial).depthTest).toBe(false);
    const subway = layers.get('transit.subway');
    expect(subway?.getObjectByName('subway-corridor')).toBeTruthy();
    expect(subway?.getObjectByName('subway-track')).toBeTruthy();
    expect(subway?.getObjectByName('station-assemblies')).toBeTruthy();
    expect(subway?.getObjectByName('terminal-gates')).toBeTruthy();
    expect(layers.get('ground.roadway')?.getObjectByName('crossing-markings')).toBeTruthy();
    expectUniqueNondegenerateFaces(layers.get('street.highway')!.children[0] as THREE.Mesh);
    expect(error.mock.calls.flat().join(' ')).not.toContain('mergeGeometries');
    error.mockRestore();
  });

  it('builds exact water and shoreline meshes and applies their visibility switches', () => {
    const view = new Map3DView();
    const blueprint = renderBlueprint();
    view.setBlueprint(blueprint);
    const layers = (view as unknown as { layers: Map<string, THREE.Group> }).layers;
    expect(layers.get('hydrology.water')?.getObjectByName('water.river')).toBeTruthy();
    expect(layers.get('hydrology.shoreline')?.getObjectByName('shoreline-bands')).toBeTruthy();
    view.setFilters({ ...defaultFilters(), 'hydrology.water': false, 'hydrology.shoreline': true });
    expect(layers.get('hydrology.water')?.visible).toBe(false);
    expect(layers.get('hydrology.shoreline')?.visible).toBe(true);
  });

  it('shows only assembled interior building batches in the 3D constraint', () => {
    const view = new Map3DView();
    const blueprint = selectionBlueprint();
    const interiorId = blueprint.volumetric.buildings[0].parcelId;
    view.setBlueprint(blueprint);
    view.setInteriorParcels([interiorId]);
    view.setFilters({ ...defaultFilters(), interiorsOnly: true });
    const layers = (view as unknown as { layers: Map<string, THREE.Group> }).layers;
    const visible = [...layers.entries()]
      .filter(([key]) => key.startsWith('zone.'))
      .flatMap(([, group]) => group.children.filter((child) => child.visible));
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((child) => child.userData.hasInterior === true)).toBe(true);
  });

  it('inserts highway profile breakpoints into a 3D deck', () => {
    const view = new Map3DView();
    const blueprint = renderBlueprint();
    const structure = blueprint.streets.highwayStructures[0];
    expect(structure).toBeTruthy();
    structure.path = [[0, 0], [20, 0]];
    structure.elevationProfile = [
      { distance: 0, level: 0 },
      { distance: 10, level: 8 },
      { distance: 20, level: 0 },
    ];
    structure.supports = [];
    view.setBlueprint(blueprint);
    const layers = (view as unknown as { layers: Map<string, { children: { geometry?: {
      getAttribute(name: string): { count: number; getX(index: number): number; getY(index: number): number; getZ(index: number): number };
    } }[] }> }).layers;
    const position = layers.get('street.highway')!.children[0]!.geometry!.getAttribute('position');
    let peakVertices = 0;
    let bendVertices = 0;
    for (let index = 0; index < position.count; index++) {
      if (Math.abs(position.getX(index) - 10) >= 0.01) continue;
      if (Math.abs(Math.abs(position.getZ(index)) - structure.width / 2) >= 0.01) continue;
      bendVertices++;
      if (Math.abs(position.getY(index) - 8) < 0.01) peakVertices++;
    }
    expect(peakVertices).toBe(2);
    expect(bendVertices).toBe(4);
  });

  it('shares one miter across the deck, barriers and underside at a highway corner', () => {
    const view = new Map3DView();
    const blueprint = renderBlueprint();
    const structure = blueprint.streets.highwayStructures[0];
    structure.path = [[0, 0], [20, 0], [20, 20]];
    structure.elevationProfile = [{ distance: 0, level: 8 }, { distance: 40, level: 8 }];
    structure.ramps = { start: 0, end: 0 };
    structure.supports = [];
    blueprint.streets.highwayStructures = [structure];
    view.setBlueprint(blueprint);
    const layers = (view as unknown as { layers: Map<string, THREE.Group> }).layers;
    const [deckMesh, barrierMesh] = layers.get('street.highway')!.children as THREE.Mesh[];
    const deck = deckMesh.geometry.getAttribute('position');
    expect(deck.count).toBe(12);
    expect(deckMesh.geometry.index?.count).toBe(60);
    const bend = Array.from({ length: 4 }, (_, offset) => [
      deck.getX(4 + offset), deck.getY(4 + offset), deck.getZ(4 + offset),
    ]);
    expect(bend).toEqual([
      [12.5, 8, 7.5],
      [27.5, 8, -7.5],
      [12.5, 7, 7.5],
      [27.5, 7, -7.5],
    ]);
    expect(bend.some(([x, , z]) => x === 20 && z === 0)).toBe(false);

    const barriers = barrierMesh.geometry.getAttribute('position');
    const hasBarrierCorner = (x: number, y: number, z: number): boolean =>
      Array.from({ length: barriers.count }, (_, index) => index).some((index) =>
        Math.abs(barriers.getX(index) - x) < 1e-6
        && Math.abs(barriers.getY(index) - y) < 1e-6
        && Math.abs(barriers.getZ(index) - z) < 1e-6);
    expect(hasBarrierCorner(12.5, 8, 7.5)).toBe(true);
    expect(hasBarrierCorner(27.5, 8, -7.5)).toBe(true);

    deckMesh.updateMatrixWorld(true);
    const visibleFrom = (origin: THREE.Vector3, direction: THREE.Vector3): boolean =>
      new THREE.Raycaster(origin, direction.normalize(), 0, 100).intersectObject(deckMesh).length > 0;
    expect(visibleFrom(new THREE.Vector3(18, 20, 0), new THREE.Vector3(0, -1, 0))).toBe(true);
    expect(visibleFrom(new THREE.Vector3(18, -10, 0), new THREE.Vector3(0, 1, 0))).toBe(true);
    expect(visibleFrom(new THREE.Vector3(40, 7.5, -2), new THREE.Vector3(-1, 0, 0))).toBe(true);
  });

  it('surfaces parameter validation failure before contacting the service', async () => {
    const app = await mount();
    await app.generate({ seed: 'invalid', size: { width: -1, depth: 100 } });
    expect(app.root.querySelector('.workspace-message')!.textContent).toContain('size.width and size.depth must be positive');
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  });

  it('loads exact interior ids from the selected assembled manifest', async () => {
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
    mapIds.mockRestore();
    map3dIds.mockRestore();
  });

  it('fails closed when the assembled manifest is invalid', async () => {
    const app = await mount(async () => ({
      ok: true,
      json: async () => ({ contractVersion: '1.0.0', interiors: ['p0'] }),
    }));
    await app.loadBlueprint(selectionBlueprint());
    await waitFor(() => expect(getByText(app.root, 'Assembled interior list unavailable')).toBeTruthy());
    await userEvent.click(getByLabelText(app.root, 'Only buildings with interiors'));
    expect((getByLabelText(app.root, 'Only buildings with interiors') as HTMLInputElement).checked).toBe(true);
  });

  it('uses the dark workspace and exposes generated geometry diagnostics', async () => {
    const app = await mount();
    expect(app.root.dataset.theme).toBe('dark');
    await app.loadBlueprint(renderBlueprint());
    expect(getByText(app.root, 'Blueprint summary')).toBeTruthy();
    expect(getByText(app.root, /runs · \d+ ramps · \d+ supports/)).toBeTruthy();
    expect(getByLabelText(app.root, 'highway centerlines')).toBeTruthy();
    expect(getByLabelText(app.root, 'station access')).toBeTruthy();
  });

  it('downloads the generated blueprint from the persistent map toolbar', async () => {
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:atlas');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const app = await mount();
    const download = getByRole(app.root, 'button', { name: 'Download blueprint', hidden: true }) as HTMLButtonElement;
    expect(download.disabled).toBe(true);
    await app.loadBlueprint(selectionBlueprint());
    expect(download.disabled).toBe(false);
    await userEvent.click(download);
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await (createUrl.mock.lastCall![0] as Blob).text())).toEqual(selectionBlueprint());
    createUrl.mockRestore();
    revokeUrl.mockRestore();
    click.mockRestore();
  });
});

describe('workspace view mode', () => {
  it('selects 3D from a loaded city and returns to creation through Atlas home', async () => {
    const app = await mount();
    expect(app.root.querySelector<HTMLElement>('.workspace-visualization')?.hidden).toBe(true);
    await app.loadBlueprint(selectionBlueprint());
    const threeD = getByLabelText(app.root, 'City in 3D');
    await userEvent.click(threeD);
    expect(app.viewMode).toBe('3d');
    expect((threeD as HTMLInputElement).checked).toBe(true);
    expect(app.root.querySelector<HTMLElement>('.map-view-3d')?.hidden).toBe(false);
    await userEvent.click(getByLabelText(app.root, 'Flat map'));
    expect(app.viewMode).toBe('2d');
    expect(app.root.querySelector<HTMLElement>('.map-view')?.hidden).toBe(false);
    await userEvent.click(getByRole(app.root, 'link', { name: 'Atlas home' }));
    expect(app.root.querySelector<HTMLElement>('.workspace-creation')?.hidden).toBe(false);
    expect(app.root.querySelector<HTMLElement>('.workspace-visualization')?.hidden).toBe(true);
  });
});
