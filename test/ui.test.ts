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

/** Clicks a grid over the map until `hit` reports the pick landed. */
async function clickUntil(canvas: HTMLElement, hit: () => boolean): Promise<void> {
  const user = userEvent.setup();
  for (let x = 30; x < CANVAS && !hit(); x += 30) {
    for (let z = 30; z < CANVAS && !hit(); z += 30) {
      await user.pointer({ target: canvas, coords: { clientX: x, clientY: z }, keys: '[MouseLeft]' });
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
    await userEvent.click(getByLabelText(toggles.root, 'Streets'));
    const allStreetsOff = { ...defaultFilters(), 'street.street': false, 'street.road': false, 'street.highway': false, 'street.alley': false };
    expect(onChange).toHaveBeenLastCalledWith(allStreetsOff);
    await userEvent.click(getByLabelText(toggles.root, 'highway'));
    expect(onChange).toHaveBeenLastCalledWith({ ...allStreetsOff, 'street.highway': true });
  });
});

describe('ParamsPanel', () => {
  const events = (): { onGenerate: ReturnType<typeof vi.fn>; onExport: ReturnType<typeof vi.fn>; onImport: ReturnType<typeof vi.fn> } => ({
    onGenerate: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
  });

  it('emits the full parameter set on Generate', async () => {
    const handlers = events();
    const panel = new ParamsPanel(handlers);
    document.body.append(panel.root);
    const seed = getByLabelText(panel.root, 'Seed');
    await userEvent.clear(seed);
    await userEvent.type(seed, 'test-9');
    await userEvent.click(getByLabelText(panel.root, 'Subways'));
    await userEvent.click(getByText(panel.root, 'Generate'));
    expect(handlers.onGenerate).toHaveBeenCalledTimes(1);
    const params = handlers.onGenerate.mock.calls[0][0];
    expect(params.seed).toBe('test-9');
    expect(params.size).toEqual({ width: 1000, depth: 1000 });
    expect(params.features).toEqual({
      highways: true,
      trains: true,
      subways: false,
      alleys: true,
      airTunnels: true,
      undergroundTunnels: true,
    });
  });

  it('exports what an imported set put in the form, carried fields included', async () => {
    const handlers = events();
    const panel = new ParamsPanel(handlers);
    document.body.append(panel.root);
    panel.setParams({
      seed: 'from-file',
      size: { width: 900, depth: 700 },
      maxFloors: 12,
      districtCount: [2, 3],
      tierWeights: { poor: 1 },
      features: { alleys: false },
    });
    await userEvent.click(getByText(panel.root, 'Export params'));
    const params = handlers.onExport.mock.calls[0][0];
    expect(params.seed).toBe('from-file');
    expect(params.size).toEqual({ width: 900, depth: 700 });
    expect(params.maxFloors).toBe(12);
    expect(params.districtCount).toEqual([2, 3]);
    expect(params.tierWeights).toEqual({ poor: 1 });
    expect(params.features.alleys).toBe(false);
    expect(params.features.trains).toBe(true);
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

  it('emits the parcel under a click', async () => {
    const blueprint = generateCity(SMALL);
    const clicked = vi.fn();
    const view = new MapView(clicked);
    document.body.append(view.canvas);
    view.setBlueprint(blueprint);
    view.resize(CANVAS, CANVAS);
    await clickUntil(view.canvas, () => clicked.mock.calls.length > 0);
    expect(clicked).toHaveBeenCalled();
    const picked = clicked.mock.calls[0][0];
    expect(blueprint.parcels.some((p) => p.id === picked.id)).toBe(true);
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
    const blueprint = generateCity({ seed: 'preview-3d', size: { width: 1000, depth: 1000 } });
    expect(blueprint.transit.trainStations.length).toBeGreaterThan(0);
    view.setBlueprint(blueprint);
    expect(error.mock.calls.flat().join(' ')).not.toContain('mergeGeometries');
    error.mockRestore();
  });

  it('blocks the form behind a progress cover while generating', async () => {
    const app = mount();
    const running = app.generate(SMALL);
    const overlay = app.root.querySelector('.progress-overlay') as HTMLElement;
    const form = app.root.querySelector('.params-form') as HTMLFieldSetElement;
    expect(overlay.hidden).toBe(false);
    expect(form.disabled).toBe(true);
    await running;
    expect(overlay.hidden).toBe(true);
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

  it('opens the configured link when a parcel is clicked', async () => {
    const app = mount();
    await app.generate(SMALL);
    app.resize();
    const canvas = app.root.querySelector('canvas') as HTMLCanvasElement;
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);

    // default template: a click opens the engine's building viewer for this seed's world
    await clickUntil(canvas, () => opened.mock.calls.length > 0);
    expect(String(opened.mock.calls[0][0])).toMatch(/^http:\/\/localhost:5306\/\?mode=building&parcel=p\d+&out=\/out\/preview$/);

    // template cleared: a click reports the parcel and opens nothing
    const user = userEvent.setup();
    await user.clear(getByLabelText(app.root, 'URL template'));
    opened.mockClear();
    const reported = (): boolean => /p\d+: \w+/.test(getByRole(app.root, 'log').textContent ?? '');
    await clickUntil(canvas, reported);
    expect(reported()).toBe(true);
    expect(opened).not.toHaveBeenCalled();

    await user.click(getByLabelText(app.root, 'URL template'));
    await user.paste('https://engine.test/?seed={seed}&parcel={parcelId}');
    await clickUntil(canvas, () => opened.mock.calls.length > 0);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(String(opened.mock.calls[0][0])).toMatch(/^https:\/\/engine\.test\/\?seed=preview&parcel=p\d+$/);
    expect(getByRole(app.root, 'log').textContent).toContain('https://engine.test/?seed=preview&parcel=p');
    opened.mockRestore();
  });
});

describe('sidebar tabs and view mode', () => {
  it('shows creation first, switches to visualization, hides a tab clicked twice, and switches the map to 3D', async () => {
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
    await userEvent.click(threeD);
    expect(app.viewMode).toBe('3d');
    expect(app.root.querySelector('.map-view-3d')?.hidden).toBe(false);

    await userEvent.click(visualization);
    expect(visualization.getAttribute('aria-pressed')).toBe('false');
    expect(threeD.closest('.tab-pane')?.hidden).toBe(true);
    app.root.remove();
  });
});
