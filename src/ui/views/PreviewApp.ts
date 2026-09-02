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
import { BlueprintOverview } from '../widgets/BlueprintOverview';
import { InspectorPanel } from '../widgets/InspectorPanel';
import { MapToolbar } from '../widgets/MapToolbar';
import { downloadBlueprint } from '../components/blueprintFile';
import { downloadParams, paramsFileName, parseParams } from '../components/paramsFile';
import { el } from '../components/dom';

export class PreviewApp {
  readonly root: HTMLElement;
  private readonly inspector: InspectorPanel;
  private readonly map: MapView;
  private readonly map3d: Map3DView;
  private readonly tabs: ViewTabs;
  private readonly modeSwitch: ViewModeSwitch;
  private mode: ViewMode = '2d';
  private readonly panel: ParamsPanel;
  private readonly parcelLink = new ParcelLink();
  private readonly notifications = new Notifications();
  private readonly progress = new ProgressOverlay();
  private readonly overview = new BlueprintOverview();
  private readonly toolbar: MapToolbar;
  private readonly mapWrap: HTMLElement;
  private blueprint: CityBlueprint | null = null;
  private pending3d: CityBlueprint | null = null;
  private busy = false;

  constructor() {
    this.inspector = new InspectorPanel(
      (parcel) => this.openParcel(parcel),
      () => this.map.clearSelection(),
    );
    this.map = new MapView(
      (hit) => { this.inspector.select(hit); this.tabs.show('visualization'); },
      (hit) => this.inspector.preview(hit),
    );
    this.map3d = new Map3DView(
      (parcel) => this.openParcel(parcel),
      (parcel) => { this.inspector.select({ kind: 'parcel', parcel }); this.tabs.show('visualization'); },
    );
    this.panel = new ParamsPanel({
      onGenerate: (params) => void this.generate(params),
      onExport: (params) => this.exportParams(params),
      onImport: (file) => void this.importParams(file),
    });
    const layers = new LayerToggles((next) => { this.map.setFilters(next); this.map3d.setFilters(next); });
    this.modeSwitch = new ViewModeSwitch((mode) => this.setMode(mode));
    const visualizationIntro = el('section', { class: 'visualization-intro' }, [
      el('p', { class: 'eyebrow', text: 'Map display' }),
      el('h2', { text: 'Visualization' }),
      el('p', { text: 'Show one system at a time or combine layers to inspect their fit.' }),
    ]);
    this.tabs = new ViewTabs(
      [this.panel.root],
      [visualizationIntro, this.modeSwitch.root, this.overview.root, layers.root, this.inspector.root, this.parcelLink.root, new LegendWidget().root],
      (active) => {
        if (active === 'visualization') this.setMode('3d');
        requestAnimationFrame(() => this.resize());
      },
    );
    const sidebar = el('div', { class: 'sidebar' });
    sidebar.append(
      el('header', { class: 'app-heading' }, [
        el('span', { class: 'app-mark', 'aria-hidden': 'true', text: 'A' }),
        el('div', {}, [el('strong', { text: 'Atlas' }), el('span', { text: 'City blueprint generator' })]),
      ]),
      this.tabs.root,
    );
    this.mapWrap = el('div', { class: 'map-wrap' });
    this.toolbar = new MapToolbar({ onFit: () => this.fitView(), onDownload: () => this.exportBlueprint() });
    this.map3d.canvas.hidden = true;
    this.mapWrap.append(this.map.canvas, this.map3d.canvas, this.toolbar.root, this.progress.root, this.notifications.root);
    this.root = el('div', { class: 'preview', 'data-theme': 'dark' });
    this.root.append(sidebar, this.mapWrap);
  }

  /** Builds a city, blocking the form until it is on screen. */
  async generate(params: AtlasParams): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.panel.setBusy(true);
    this.panel.setStatus('');
    this.progress.show('preparing', `Seed ${String(params.seed)}`);
    await nextFrame(); // paint the blocked state before generation holds the thread
    try {
      this.progress.update('generating', 'Laying out districts, streets, parcels and transit');
      await nextFrame();
      const started = performance.now();
      const blueprint = generateCity(params);
      this.blueprint = blueprint;
      this.progress.update('rendering', 'Drawing the blueprint preview');
      await nextFrame();
      this.map.setBlueprint(blueprint);
      if (this.mode === '3d') this.map3d.setBlueprint(blueprint);
      else this.pending3d = blueprint;
      this.overview.setBlueprint(blueprint);
      this.toolbar.setBlueprint(blueprint);
      this.panel.setStatus(
        `${Math.round(performance.now() - started)} ms, pop ${blueprint.stats.population.toLocaleString()}, ` +
          `${blueprint.parcels.length} parcels, ${blueprint.districts.length} districts`,
      );
      this.progress.update('ready', `${blueprint.parcels.length} parcels ready to inspect`);
      await nextFrame();
    } catch (e) {
      this.panel.setStatus('generation failed');
      this.progress.update('error', e instanceof Error ? e.message : String(e));
      await nextFrame();
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
    this.modeSwitch.setMode(mode);
    this.map.canvas.hidden = mode !== '2d';
    this.map3d.canvas.hidden = mode !== '3d';
    if (mode === '3d') {
      if (this.pending3d) {
        this.map3d.setBlueprint(this.pending3d);
        this.pending3d = null;
      }
      this.map3d.shown();
    }
    this.resize();
  }

  get viewMode(): ViewMode {
    return this.mode;
  }

  private fitView(): void {
    if (this.mode === '2d') this.map.resetView();
    else this.map3d.resetView();
  }

  private exportBlueprint(): void {
    if (!this.blueprint) return;
    const filename = downloadBlueprint(this.blueprint);
    this.notifications.info(`blueprint written to ${filename}`);
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
