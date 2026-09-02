/** Persistent controls over the map canvas. */
import type { CityBlueprint } from '../../../schema/blueprint';
import { el } from '../components/dom';

export interface MapToolbarEvents {
  onFit: () => void;
  onDownload: () => void;
}

export class MapToolbar {
  readonly root: HTMLElement;
  private readonly city: HTMLElement;
  private readonly download: HTMLButtonElement;

  constructor(events: MapToolbarEvents) {
    this.city = el('span', { class: 'toolbar-city', text: 'No city loaded' });
    this.download = button('Download blueprint', events.onDownload);
    this.download.disabled = true;
    this.root = el('div', { class: 'map-toolbar', 'aria-label': 'Map controls' }, [
      el('div', { class: 'toolbar-context' }, [this.city, el('span', { text: 'Drag to pan · Wheel to zoom · Right-click to inspect' })]),
      el('div', { class: 'toolbar-actions' }, [button('Fit city', events.onFit), this.download]),
    ]);
  }

  setBlueprint(blueprint: CityBlueprint): void {
    this.city.textContent = `${blueprint.meta.seed} · ${blueprint.meta.params.size.width} × ${blueprint.meta.params.size.depth} m`;
    this.download.disabled = false;
  }
}

function button(label: string, handler: () => void): HTMLButtonElement {
  const node = el('button', { type: 'button', text: label }) as HTMLButtonElement;
  node.addEventListener('click', handler);
  return node;
}
