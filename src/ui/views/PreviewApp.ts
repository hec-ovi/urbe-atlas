/**
 * The preview: params, layers, parcel link and legend on the left, map on the
 * right. Owns the generation flow: the form locks behind a progress cover
 * while a city builds, failures land in the notification stack, and a parcel
 * click opens the configured link.
 */
import type { AtlasParams } from '../../../schema/params';
import type { CityBlueprint, Parcel } from '../../../schema/blueprint';
import { generateCity } from '../..';
import { AtlasError } from '../../errors';
import { MapView } from './MapView';
import { Map3DView } from './Map3DView';
import { ViewTabs } from '../widgets/ViewTabs';
import { ViewModeSwitch, type ViewMode } from '../widgets/ViewModeSwitch';
import { LayerToggles } from '../widgets/LayerToggles';
import { LegendWidget } from '../widgets/LegendWidget';
import { Notifications } from '../widgets/Notifications';
import { ParamsPanel } from '../widgets/ParamsPanel';
import { ParcelLink } from '../widgets/ParcelLink';
import { ProgressOverlay } from '../widgets/ProgressOverlay';
import { downloadParams, paramsFileName, parseParams } from '../components/paramsFile';
import { el } from '../components/dom';

export class PreviewApp {
  readonly root: HTMLElement;
  private readonly map = new MapView((parcel) => this.openParcel(parcel));
  private readonly map3d = new Map3DView((parcel) => this.openParcel(parcel));
  private mode: ViewMode = '2d';
  private readonly panel: ParamsPanel;
  private readonly parcelLink = new ParcelLink();
  private readonly notifications = new Notifications();
  private readonly progress = new ProgressOverlay();
  private readonly mapWrap: HTMLElement;
  private blueprint: CityBlueprint | null = null;
  private busy = false;

  constructor() {
    this.panel = new ParamsPanel({
      onGenerate: (params) => void this.generate(params),
      onExport: (params) => this.exportParams(params),
      onImport: (file) => void this.importParams(file),
    });
    const layers = new LayerToggles((next) => { this.map.setLayers(next); this.map3d.setLayers(next); });
    const viewMode = new ViewModeSwitch((mode) => this.setMode(mode));
    const tabs = new ViewTabs(
      [this.panel.root],
      [viewMode.root, layers.root, this.parcelLink.root, new LegendWidget().root],
      () => requestAnimationFrame(() => this.resize()),
    );
    const sidebar = el('div', { class: 'sidebar' });
    sidebar.append(tabs.root);
    this.mapWrap = el('div', { class: 'map-wrap' });
    this.map3d.canvas.hidden = true;
    this.mapWrap.append(this.map.canvas, this.map3d.canvas, this.progress.root, this.notifications.root);
    this.root = el('div', { class: 'preview' });
    this.root.append(sidebar, this.mapWrap);
  }

  /** Builds a city, blocking the form until it is on screen. */
  async generate(params: AtlasParams): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.panel.setBusy(true);
    this.panel.setStatus('');
    this.progress.show(`generating ${String(params.seed)}...`);
    await nextFrame(); // paint the blocked state before generation holds the thread
    try {
      const started = performance.now();
      const blueprint = generateCity(params);
      this.blueprint = blueprint;
      this.map.setBlueprint(blueprint);
      this.map3d.setBlueprint(blueprint);
      this.panel.setStatus(
        `${Math.round(performance.now() - started)} ms, pop ${blueprint.stats.population.toLocaleString()}, ` +
          `${blueprint.parcels.length} parcels, ${blueprint.districts.length} districts`,
      );
    } catch (e) {
      this.panel.setStatus('generation failed');
      this.notifications.error(e instanceof AtlasError ? `${e.code}: ${e.message}` : String(e));
    } finally {
      this.progress.hide();
      this.panel.setBusy(false);
      this.busy = false;
    }
  }

  /** Fits the map to its pane. */
  resize(): void {
    this.map.resize(this.mapWrap.clientWidth, this.mapWrap.clientHeight);
    this.map3d.resize(this.mapWrap.clientWidth, this.mapWrap.clientHeight);
  }

  /** Flat map or the city in three dimensions; the 3D view starts drawing the first time it is shown. */
  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.map.canvas.hidden = mode !== '2d';
    this.map3d.canvas.hidden = mode !== '3d';
    if (mode === '3d') this.map3d.shown();
    this.resize();
  }

  get viewMode(): ViewMode {
    return this.mode;
  }

  private exportParams(params: AtlasParams): void {
    const name = paramsFileName(params.seed);
    downloadParams(params, name);
    this.notifications.info(`parameters written to ${name}`);
  }

  private async importParams(file: File): Promise<void> {
    try {
      this.panel.setParams(parseParams(await file.text()));
      this.notifications.info(`${file.name} loaded into the form, press Generate`);
    } catch (e) {
      this.notifications.error(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private openParcel(parcel: Parcel): void {
    const url = this.parcelLink.linkFor(parcel, this.blueprint?.meta.seed ?? '');
    if (!url) {
      this.notifications.info(`${parcel.id}: ${parcel.type} ${parcel.tier}, block ${parcel.blockId}`);
      return;
    }
    window.open(url, '_blank', 'noopener');
    this.notifications.info(`${parcel.id} opened:`, { href: url, label: url });
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
