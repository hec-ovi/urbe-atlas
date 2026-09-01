/** Checkbox row switching map layers on and off. */
import type { Layers } from '../views/MapView';
import { DEFAULT_LAYERS } from '../views/MapView';
import { el } from '../components/dom';

const LABELS: Record<keyof Layers, string> = {
  ground: 'Ground',
  zones: 'Zones',
  streets: 'Streets',
  transit: 'Transit',
  districts: 'Districts',
};

export class LayerToggles {
  readonly root: HTMLElement;
  private readonly layers: Layers = { ...DEFAULT_LAYERS };

  constructor(onChange: (layers: Layers) => void) {
    this.root = el('div', { class: 'layer-toggles' });
    for (const key of Object.keys(LABELS) as (keyof Layers)[]) {
      const input = el('input', { type: 'checkbox', id: `layer-${key}` });
      input.checked = this.layers[key];
      input.addEventListener('change', () => {
        this.layers[key] = input.checked;
        onChange({ ...this.layers });
      });
      this.root.append(el('label', { for: `layer-${key}` }, [input, LABELS[key]]));
    }
  }
}
