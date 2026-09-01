// @vitest-environment happy-dom
/** UI box contract: components render and emit the events CONTRACT.md lists. */
import { describe, expect, it, vi } from 'vitest';
import { getByLabelText, getByText } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { LegendWidget } from '../src/ui/widgets/LegendWidget';
import { LayerToggles } from '../src/ui/widgets/LayerToggles';
import { ParamsPanel } from '../src/ui/widgets/ParamsPanel';
import { MapView, DEFAULT_LAYERS } from '../src/ui/views/MapView';

describe('LegendWidget', () => {
  it('shows every parcel type with all four tier swatches', () => {
    const legend = new LegendWidget();
    document.body.append(legend.root);
    expect(getByText(legend.root, 'coffee shop')).toBeTruthy();
    expect(getByText(legend.root, 'residential')).toBeTruthy();
    expect(legend.root.querySelectorAll('.swatch').length).toBeGreaterThanOrEqual(13 * 4);
  });
});

describe('LayerToggles', () => {
  it('emits the updated layer set when a checkbox changes', async () => {
    const onChange = vi.fn();
    const toggles = new LayerToggles(onChange);
    document.body.append(toggles.root);
    await userEvent.click(getByLabelText(toggles.root, 'Streets'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_LAYERS, streets: false });
  });
});

describe('ParamsPanel', () => {
  it('emits AtlasParams from the form on Generate', async () => {
    const onGenerate = vi.fn();
    const panel = new ParamsPanel(onGenerate);
    document.body.append(panel.root);
    const seed = getByLabelText(panel.root, 'Seed');
    await userEvent.clear(seed);
    await userEvent.type(seed, 'test-9');
    await userEvent.click(getByLabelText(panel.root, 'Subways'));
    await userEvent.click(getByText(panel.root, 'Generate'));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    const params = onGenerate.mock.calls[0][0];
    expect(params.seed).toBe('test-9');
    expect(params.features.subways).toBe(false);
    expect(params.size.width).toBe(3000);
  });

  it('shows generation status text', () => {
    const panel = new ParamsPanel(() => {});
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
});
