// @vitest-environment happy-dom
/** UI box contract: components render and emit the events src/ui/CONTRACT.md lists. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getByLabelText, getByRole, getByText, waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { generateCity } from '../src';
import type { AtlasParams } from '../schema/params';
import { LegendWidget } from '../src/ui/widgets/LegendWidget';
import { defaultFilters } from '../src/ui/views/filters';
import { LayerToggles } from '../src/ui/widgets/LayerToggles';
import { ParamsPanel } from '../src/ui/widgets/ParamsPanel';
import { MapView, DEFAULT_LAYERS } from '../src/ui/views/MapView';
import { PreviewApp } from '../src/ui/views/PreviewApp';
import { Map3DView } from '../src/ui/views/Map3DView';

/** A city small enough to build inside a test, big enough to have parcels. */
const SMALL: AtlasParams = { seed: 'preview', size: { width: 600, depth: 600 } };
const CANVAS = 600;

beforeEach(() => {
  document.body.replaceChildren();
});

/** Right-clicks a grid over the map until `hit` reports the pick landed. */
async function inspectUntil(canvas: HTMLElement, hit: () => boolean): Promise<void> {
  const user = userEvent.setup();
  for (let x = 30; x < CANVAS && !hit(); x += 30) {
    for (let z = 30; z < CANVAS && !hit(); z += 30) {
      await user.pointer({ target: canvas, coords: { clientX: x, clientY: z }, keys: '[MouseRight]' });
    }
  }
}

function mount(): PreviewApp {
  const app = new PreviewApp();
  document.body.append(app.root);
  const wrap = app.root.querySelector('.map-wrap') as HTMLElement;
  Object.defineProperty(wrap, 'clientWidth', { value: CANVAS });
  Object.defineProperty(wrap, 'clientHeight', { value: CANVAS });
  return app;
}

describe('LegendWidget', () => {
  it('shows every parcel type with all four tier swatches', () => {
    const legend = new LegendWidget();
    document.body.append(legend.root);
    expect(getByText(legend.root, 'coffee shop')).toBeTruthy();
    expect(getByText(legend.root, 'residential')).toBeTruthy();
    expect(getByText(legend.root, 'alley')).toBeTruthy();
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
    const transit = getByLabelText(toggles.root, 'Public transit').closest('.layer-group')!;
    await userEvent.click(getByRole(transit, 'button', { name: 'Only' }));
    const isolated = onChange.mock.lastCall![0];
    expect(isolated['transit.bus']).toBe(true);
    expect(isolated['transit.train']).toBe(true);
    expect(isolated['street.highway']).toBe(false);
  });
});

describe('ParamsPanel', () => {
  const events = (): { onGenerate: ReturnType<typeof vi.fn>; onExport: ReturnType<typeof vi.fn>; onImport: ReturnType<typeof vi.fn> } => ({
    onGenerate: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
  });

  it('emits every contract parameter on Generate', async () => {
    const handlers = events();
    const panel = new ParamsPanel(handlers);
    document.body.append(panel.root);
    const seed = getByLabelText(panel.root, 'Seed');
    await userEvent.clear(seed);
    await userEvent.type(seed, 'test-9');
    await userEvent.click(getByLabelText(panel.root, 'Subways'));
    await userEvent.click(getByText(panel.root, 'Generate city'));
    expect(handlers.onGenerate).toHaveBeenCalledTimes(1);
    const params = handlers.onGenerate.mock.calls[0][0];
    expect(params.seed).toBe('test-9');
    expect(params.size).toEqual({ width: 1000, depth: 1000 });
    expect(params.districtCount).toEqual([1, 3]);
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

  it('exposes imported district caps and weights in the editable form and export', async () => {
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
    });
    await userEvent.click(getByText(panel.root, 'Save parameters'));
    const params = handlers.onExport.mock.calls[0][0];
    expect(params.seed).toBe('from-file');
    expect(params.size).toEqual({ width: 900, depth: 700 });
    expect(params.maxFloors).toBe(12);
    expect(params.districtCount).toEqual([2, 3]);
    expect(params.maxFloorsByDistrict).toEqual({ downtown: 9 });
    expect(params.tierWeights).toEqual({ poor: 1, mid: 0.45, rich: 0.2, high_rich: 0.05 });
    expect(params.features.alleys).toBe(false);
    expect(params.features.trains).toBe(true);
  });

  it('keeps slider and exact value synchronized and blocks invalid input', async () => {
    const handlers = events();
    const panel = new ParamsPanel(handlers);
    document.body.append(panel.root);
    const width = getByLabelText(panel.root, 'Width (m)') as HTMLInputElement;
    const slider = getByLabelText(panel.root, 'Width (m) slider') as HTMLInputElement;
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
    await userEvent.click(getByRole(panel.root, 'button', { name: 'Compact' }));
    expect(seed.value).toBe(generatedSeed);
    expect((getByLabelText(panel.root, 'Width (m)') as HTMLInputElement).value).toBe('600');
    expect((getByLabelText(panel.root, 'Highways') as HTMLInputElement).checked).toBe(false);
  });

  it('shows generation status and locks the form while busy', () => {
    const panel = new ParamsPanel(events());
    document.body.append(panel.root);
    const form = panel.root.querySelector('.params-form') as HTMLFieldSetElement;
    panel.setBusy(true);
    expect(form.disabled).toBe(true);
    panel.setBusy(false);
    expect(form.disabled).toBe(false);
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

  it('pins a map feature only from a right-click', async () => {
    const blueprint = generateCity(SMALL);
    const selected = vi.fn();
    const view = new MapView(selected);
    document.body.append(view.canvas);
    view.setBlueprint(blueprint);
    view.resize(CANVAS, CANVAS);
    await userEvent.click(view.canvas);
    expect(selected).not.toHaveBeenCalled();
    await inspectUntil(view.canvas, () => selected.mock.calls.length > 0);
    expect(selected).toHaveBeenCalled();
    expect(['parcel', 'street', 'station']).toContain(selected.mock.calls[0][0].kind);
  });
});

describe('PreviewApp', () => {
  it('defers 3D geometry until that view is selected', async () => {
    const built3d = vi.spyOn(Map3DView.prototype, 'setBlueprint');
    const app = mount();
    await app.generate(SMALL);
    expect(built3d).not.toHaveBeenCalled();
    app.setMode('3d');
    expect(built3d).toHaveBeenCalledTimes(1);
    built3d.mockRestore();
  });

  it('merges indexed station posts with non-indexed platforms without a geometry error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = new Map3DView();
    const blueprint = generateCity({ seed: 'urbe', size: { width: 1000, depth: 1000 } });
    expect(blueprint.transit.trainStations.length).toBeGreaterThan(0);
    expect(blueprint.transit.subwayStations.length).toBeGreaterThan(0);
    view.setBlueprint(blueprint);
    const layers = (view as unknown as {
      layers: Map<string, { getObjectByName(name: string): unknown }>;
    }).layers;
    expect([...layers.entries()].some(([key, group]) =>
      key.startsWith('zone.') && group.getObjectByName('floor-elevations') !== undefined)).toBe(true);
    expect(layers.has('diagnostic.highwayCenterlines')).toBe(blueprint.streets.highwayStructures.length > 0);
    expect(layers.has('diagnostic.highwaySupports')).toBe(blueprint.streets.highwayStructures.some((item) => item.supports.length > 0));
    expect(layers.has('diagnostic.stationAccess')).toBe(blueprint.transit.subwayStations.some((item) => item.accessPaths.length > 0));
    expect(error.mock.calls.flat().join(' ')).not.toContain('mergeGeometries');
    error.mockRestore();
  });

  it('inserts highway profile breakpoints into a 3D deck', () => {
    const view = new Map3DView();
    const blueprint = generateCity({ seed: 'profile-preview', size: { width: 1000, depth: 1000 } });
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
    const layers = (view as unknown as { layers: Map<string, { traverse(visitor: (node: unknown) => void): void }> }).layers;
    let hasPeak = false;
    layers.get('street.highway')!.traverse((node) => {
      const geometry = (node as { geometry?: { getAttribute(name: string): { count: number; getX(index: number): number; getY(index: number): number; getZ(index: number): number } } }).geometry;
      const position = geometry?.getAttribute('position');
      if (!position) return;
      for (let index = 0; index < position.count; index++) {
        if (Math.abs(position.getX(index) - 10) < 0.01 && position.getY(index) > 7.99 && Math.abs(position.getZ(index)) < 0.01) hasPeak = true;
      }
    });
    expect(hasPeak).toBe(true);
  });

  it('blocks the form behind a progress cover while generating', async () => {
    const app = mount();
    const running = app.generate(SMALL);
    const overlay = app.root.querySelector('.progress-overlay') as HTMLElement;
    const form = app.root.querySelector('.params-form') as HTMLFieldSetElement;
    expect(overlay.hidden).toBe(false);
    expect(overlay.dataset.stage).toBe('preparing');
    expect(form.disabled).toBe(true);
    await running;
    expect(overlay.hidden).toBe(true);
    expect(overlay.dataset.stage).toBe('ready');
    expect(form.disabled).toBe(false);
    expect(app.root.querySelector('.status')?.textContent).toContain('parcels');
  });

  it('surfaces a generation failure as a notification', async () => {
    const app = mount();
    await app.generate({ seed: 'too-small', size: { width: 100, depth: 100 } });
    expect(getByRole(app.root, 'log').textContent).toContain('E_UNSATISFIABLE');
    expect((app.root.querySelector('.progress-overlay') as HTMLElement).hidden).toBe(true);
  });

  it('imports a parameter file into the form and refuses a broken one', async () => {
    const app = mount();
    const input = getByLabelText(app.root, 'Parameter file');
    const params = { seed: 'imported', size: { width: 900, depth: 700 }, features: { alleys: false } };
    await userEvent.upload(input, new File([JSON.stringify(params)], 'city.json', { type: 'application/json' }));
    await waitFor(() => {
      expect((getByLabelText(app.root, 'Seed') as HTMLInputElement).value).toBe('imported');
    });
    expect((getByLabelText(app.root, 'Width (m)') as HTMLInputElement).value).toBe('900');
    expect((getByLabelText(app.root, 'Alleys') as HTMLInputElement).checked).toBe(false);
    expect(getByRole(app.root, 'log').textContent).toContain('city.json');

    await userEvent.upload(input, new File(['not json'], 'broken.json', { type: 'application/json' }));
    await waitFor(() => {
      expect(getByRole(app.root, 'log').textContent).toContain('broken.json: not valid JSON');
    });

    await userEvent.upload(input, new File([
      JSON.stringify({ seed: 'invalid', size: { width: -1, depth: 700 } }),
    ], 'invalid.json', { type: 'application/json' }));
    await waitFor(() => {
      expect(getByRole(app.root, 'log').textContent).toContain('invalid.json: size.width and size.depth must be positive');
    });
  });

  it('inspects a parcel before opening its configured link', async () => {
    const app = mount();
    await app.generate(SMALL);
    app.resize();
    const canvas = app.root.querySelector('canvas') as HTMLCanvasElement;
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);

    const parcelSelected = () => app.root.querySelector('.inspector-open') !== null;
    await inspectUntil(canvas, parcelSelected);
    expect(parcelSelected()).toBe(true);
    await userEvent.click(getByRole(app.root, 'button', { name: 'Open building view' }));
    expect(String(opened.mock.calls[0][0])).toMatch(/^http:\/\/localhost:5306\/\?mode=building&parcel=p\d+&out=\/out\/preview$/);

    // template cleared: the inspector reports the parcel and opens nothing
    const user = userEvent.setup();
    await user.clear(getByLabelText(app.root, 'URL template'));
    opened.mockClear();
    await user.click(getByRole(app.root, 'button', { name: 'Open building view' }));
    const reported = (): boolean => /p\d+: \w+/.test(getByRole(app.root, 'log').textContent ?? '');
    expect(reported()).toBe(true);
    expect(opened).not.toHaveBeenCalled();

    await user.click(getByLabelText(app.root, 'URL template'));
    await user.paste('https://engine.test/?seed={seed}&parcel={parcelId}');
    await user.click(getByRole(app.root, 'button', { name: 'Open building view' }));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(String(opened.mock.calls[0][0])).toMatch(/^https:\/\/engine\.test\/\?seed=preview&parcel=p\d+$/);
    expect(getByRole(app.root, 'log').textContent).toContain('https://engine.test/?seed=preview&parcel=p');

    await user.click(getByRole(app.root, 'button', { name: 'Clear selection' }));
    expect(getByText(app.root, 'Hover to preview. Right-click a feature to keep its measurements here.')).toBeTruthy();
    opened.mockRestore();
  });

  it('uses the dark workspace and exposes generated geometry diagnostics', async () => {
    const app = mount();
    expect(app.root.dataset.theme).toBe('dark');
    await app.generate({ seed: 'diagnostics', size: { width: 1000, depth: 1000 } });
    await userEvent.click(getByRole(app.root, 'button', { name: 'Visualization' }));
    expect(getByText(app.root, 'Blueprint summary')).toBeTruthy();
    expect(getByText(app.root, /runs · \d+ ramps · \d+ supports/)).toBeTruthy();
    expect(getByLabelText(app.root, 'highway centerlines')).toBeTruthy();
    expect(getByLabelText(app.root, 'station access')).toBeTruthy();
  });

  it('downloads the generated blueprint from the persistent map toolbar', async () => {
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:atlas');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const app = mount();
    const download = getByRole(app.root, 'button', { name: 'Download blueprint' }) as HTMLButtonElement;
    expect(download.disabled).toBe(true);
    await app.generate(SMALL);
    expect(download.disabled).toBe(false);
    await userEvent.click(download);
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(getByRole(app.root, 'log').textContent).toContain('atlas-blueprint-preview.json');
    createUrl.mockRestore();
    revokeUrl.mockRestore();
    click.mockRestore();
  });
});

describe('sidebar tabs and view mode', () => {
  it('opens Visualization in 3D and keeps the flat map selectable', async () => {
    const { PreviewApp } = await import('../src/ui/views/PreviewApp');
    const app = new PreviewApp();
    document.body.append(app.root);
    const creation = getByRole(app.root, 'button', { name: 'Creation' });
    const visualization = getByRole(app.root, 'button', { name: 'Visualization' });
    expect(creation.getAttribute('aria-pressed')).toBe('true');
    expect(getByLabelText(app.root, 'City in 3D').closest('.tab-pane')?.hidden).toBe(true);

    await userEvent.click(visualization);
    expect(visualization.getAttribute('aria-pressed')).toBe('true');
    expect(creation.getAttribute('aria-pressed')).toBe('false');
    const threeD = getByLabelText(app.root, 'City in 3D');
    expect(app.viewMode).toBe('3d');
    expect((threeD as HTMLInputElement).checked).toBe(true);
    expect(app.root.querySelector('.map-view-3d')?.hidden).toBe(false);

    const flat = getByLabelText(app.root, 'Flat map');
    await userEvent.click(flat);
    expect(app.viewMode).toBe('2d');
    expect((flat as HTMLInputElement).checked).toBe(true);
    expect(app.root.querySelector('.map-view')?.hidden).toBe(false);

    await userEvent.click(creation);
    await userEvent.click(visualization);
    expect(visualization.getAttribute('aria-pressed')).toBe('true');
    expect(app.viewMode).toBe('3d');
    expect((threeD as HTMLInputElement).checked).toBe(true);
    expect(threeD.closest('.tab-pane')?.hidden).toBe(false);
    app.root.remove();
  });
});
