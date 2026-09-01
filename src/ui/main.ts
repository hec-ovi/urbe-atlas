/** Preview app: params panel + legend on the left, pan/zoom map on the right. */
import { generateCity } from '..';
import { AtlasError } from '../errors';
import { MapView } from './views/MapView';
import { LayerToggles } from './widgets/LayerToggles';
import { LegendWidget } from './widgets/LegendWidget';
import { ParamsPanel } from './widgets/ParamsPanel';
import { el } from './components/dom';
import './style.css';

const app = document.getElementById('app')!;
const map = new MapView();
const panel = new ParamsPanel((params) => {
  panel.setStatus('generating...');
  requestAnimationFrame(() => {
    try {
      const t0 = performance.now();
      const bp = generateCity(params);
      map.setBlueprint(bp);
      panel.setStatus(
        `${Math.round(performance.now() - t0)} ms, pop ${bp.stats.population.toLocaleString()}, ` +
          `${bp.parcels.length} parcels, ${bp.districts.length} districts`,
      );
    } catch (e) {
      panel.setStatus(e instanceof AtlasError ? `${e.code}: ${e.message}` : String(e));
    }
  });
});
const toggles = new LayerToggles((layers) => map.setLayers(layers));
const legend = new LegendWidget();

const sidebar = el('div', { class: 'sidebar' });
sidebar.append(panel.root, toggles.root, legend.root);
const mapWrap = el('div', { class: 'map-wrap' });
mapWrap.append(map.canvas);
app.append(sidebar, mapWrap);

function fit(): void {
  map.resize(mapWrap.clientWidth, mapWrap.clientHeight);
}
window.addEventListener('resize', fit);
fit();

const t0 = performance.now();
const bp = generateCity({ seed: 'urbe' });
map.setBlueprint(bp);
panel.setStatus(
  `${Math.round(performance.now() - t0)} ms, pop ${bp.stats.population.toLocaleString()}, ` +
    `${bp.parcels.length} parcels, ${bp.districts.length} districts`,
);
