/** City creation and saved blueprint inspection with independent building steps. */
import type { AtlasParams } from '../../../schema/params';
import type { CityBlueprint } from '../../../schema/blueprint';
import type { CityRecord, WorkspaceForm } from '../../cities/schema';
import { AtlasError } from '../../errors';
import { MapView } from './MapView';
import { Map3DView } from './Map3DView';
import { WorkspaceNav, type WorkspaceName } from './WorkspaceNav';
import type { ViewMode } from '../widgets/ViewModeSwitch';
import { LegendWidget } from '../widgets/LegendWidget';
import { Notifications } from '../widgets/Notifications';
import { ParamsPanel } from '../widgets/ParamsPanel';
import { ParcelLink } from '../widgets/ParcelLink';
import { CityLibrary } from '../widgets/CityLibrary';
import { BlueprintOverview } from '../widgets/BlueprintOverview';
import { InspectorPanel } from '../widgets/InspectorPanel';
import { MapToolbar } from '../widgets/MapToolbar';
import { ExteriorPreview } from '../widgets/ExteriorPreview';
import { CityApi } from '../components/CityApi';
import { Form } from '../components/Form';
import { downloadBlueprint } from '../components/blueprintFile';
import { readBlueprint } from '../components/blueprintInput';
import { isWorldManifest } from '../components/worldManifest';
import { downloadParams, paramsFileName, parseParams } from '../components/paramsFile';
import { el } from '../components/dom';
import type { Filters } from './filters';

export class PreviewApp {
  readonly root: HTMLElement;
  readonly ready: Promise<void>;
  private readonly inspector: InspectorPanel;
  private readonly exteriors: ExteriorPreview;
  private readonly map: MapView;
  private readonly map3d: Map3DView;
  private readonly nav: WorkspaceNav;
  private mode: ViewMode = '2d';
  private panel: ParamsPanel | null = null;
  private visualizationForm: Form | null = null;
  private readonly parcelLink: ParcelLink;
  private readonly notifications = new Notifications();
  private readonly cities: CityLibrary;
  private readonly overview = new BlueprintOverview();
  private readonly toolbar: MapToolbar;
  private readonly mapWrap: HTMLElement;
  private readonly creationPane: HTMLElement;
  private readonly visualizationPane: HTMLElement;
  private readonly api = new CityApi();
  private blueprint: CityBlueprint | null = null;
  private pending3d: CityBlueprint | null = null;
  private generating = false;
  private displayRequest = 0;
  private manifestRequest = 0;
  private manifestTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly fetchManifest: ManifestFetcher = (url) => fetch(url)) {
    this.parcelLink = new ParcelLink();
    this.inspector = new InspectorPanel(
      (parcel) => this.exteriors.destinationFor(parcel),
      () => this.map.clearSelection(),
    );
    this.exteriors = new ExteriorPreview(() => this.inspector.refresh(), (message) => this.notifications.error(message));
    this.map = new MapView((hit) => { this.inspector.select(hit); });
    this.map3d = new Map3DView((parcel) => { this.inspector.select({ kind: 'parcel', parcel }); });
    this.cities = new CityLibrary({
      onOpen: (record) => void this.openCity(record),
      onRetry: (params) => void this.generate(params),
      onStatus: (message) => this.panel?.setStatus(message),
      onInfo: (message) => this.notifications.info(message),
      onError: (message) => this.notifications.error(message),
    });
    this.parcelLink.onChange(() => {
      this.inspector.refresh();
      this.scheduleManifestLoad();
    });
    this.nav = new WorkspaceNav((name) => this.showWorkspace(name));
    this.creationPane = el('div', { class: 'workspace workspace-creation' });
    this.visualizationPane = el('div', { class: 'workspace workspace-visualization' });
    this.visualizationPane.hidden = true;
    this.mapWrap = el('div', { class: 'map-wrap' });
    this.toolbar = new MapToolbar({
      onFit: () => this.fitView(), onDownload: () => this.exportBlueprint(),
      onImport: (file) => void this.loadSaved(async () => JSON.parse(await file.text()), file.name),
    });
    this.map3d.canvas.hidden = true;
    this.mapWrap.append(this.map.canvas, this.map3d.canvas, this.toolbar.root, this.inspector.root);
    this.root = el('div', { class: 'preview', 'data-theme': 'dark' });
    this.root.append(this.nav.root, this.creationPane, this.visualizationPane, this.notifications.root);
    this.ready = this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      const [creation, visualization] = await Promise.all([
        this.api.form('creation'), this.api.form('visualization'),
      ]);
      this.mountCreation(creation);
      this.mountVisualization(visualization);
    } catch (error) {
      this.creationPane.replaceChildren(el('p', {
        class: 'form-error', role: 'alert',
        text: `Workspace forms unavailable: ${error instanceof Error ? error.message : String(error)}`,
      }));
    }
  }

  private mountCreation(schema: WorkspaceForm): void {
    this.panel = new ParamsPanel({
      onGenerate: (params) => void this.generate(params),
      onExport: (params) => this.exportParams(params),
      onImport: (file) => void this.importParams(file),
    }, schema);
    const form = el('div', { class: 'workspace-form' }, [this.panel.root]);
    const cities = el('div', { class: 'workspace-cities' }, [this.cities.root]);
    this.creationPane.style.gridTemplateColumns = `${schema.layout.ratio[0]}fr ${schema.layout.ratio[1]}fr`;
    this.creationPane.replaceChildren(form, cities);
  }

  private mountVisualization(schema: WorkspaceForm): void {
    this.visualizationForm = new Form(schema, {
      onAction: () => undefined,
      onChange: (values) => this.applyVisualization(values),
    });
    const rail = el('div', { class: 'workspace-rail' }, [
      this.exteriors.root,
      this.visualizationForm.root,
      this.overview.root,
      this.parcelLink.root,
      new LegendWidget().root,
    ]);
    this.visualizationPane.style.gridTemplateColumns = `${schema.layout.ratio[0]}fr ${schema.layout.ratio[1]}fr`;
    this.visualizationPane.replaceChildren(rail, this.mapWrap);
    this.applyVisualization(this.visualizationForm.read());
  }

  private applyVisualization(values: Record<string, unknown>): void {
    const mode = values.mode === '3d' ? '3d' : '2d';
    if (mode !== this.mode) this.setMode(mode);
    if (values.filters && typeof values.filters === 'object') {
      const filters = values.filters as Filters;
      this.map.setFilters(filters);
      this.map3d.setFilters(filters);
    }
  }

  private showWorkspace(name: WorkspaceName): void {
    this.creationPane.hidden = name !== 'creation';
    this.visualizationPane.hidden = name !== 'visualization';
    if (name === 'visualization') requestAnimationFrame(() => this.resize());
  }

  /** Waits for server generation while the current map and controls remain usable. */
  async generate(params: AtlasParams): Promise<void> {
    await this.ready;
    if (this.generating) return;
    this.generating = true;
    const displayRequest = this.displayRequest;
    this.panel?.setBusy(true);
    this.cities.setBusy(true);
    try {
      const record = await this.cities.generate(parseParams(JSON.stringify(params)));
      this.panel?.setStatus(`City ${String(record.seed)}: blueprint ready.`);
      if (displayRequest === this.displayRequest) {
        await this.openCity(record);
      } else this.notifications.info(`City ${String(record.seed)} is ready. Open it from Saved cities.`);
    } catch (e) {
      this.panel?.setStatus('Blueprint generation failed. Check Saved cities or try again.');
      this.notifications.error(e instanceof AtlasError ? `${e.code}: ${e.message}` : String(e));
    } finally {
      this.panel?.setBusy(false);
      this.cities.setBusy(false);
      this.generating = false;
    }
  }

  refreshCities(): Promise<void> { return this.cities.refresh(); }

  private openCity(record: CityRecord): Promise<void> {
    this.nav.show('visualization');
    return this.loadSaved(() => this.cities.blueprintFor(record), `City ${String(record.seed)}`, true);
  }

  /** Inspect a saved object without generating or certifying its geometry. */
  async loadBlueprint(value: unknown): Promise<void> {
    await this.loadSaved(async () => value, 'Saved blueprint');
  }

  /** URL imports are restricted to this preview origin, including redirects. */
  async loadBlueprintUrl(source: string): Promise<void> {
    await this.loadSaved(async () => {
      if (!source.trim()) throw new Error('Blueprint URL is empty');
      const url = new URL(source, window.location.href);
      if (url.origin !== window.location.origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('Blueprint URL must use this preview origin');
      }
      const response = await fetch(url.href, { mode: 'same-origin', redirect: 'error' });
      if (!response.ok) throw new Error(`Blueprint request failed (${response.status})`);
      return response.json();
    }, 'Saved blueprint');
  }

  private async loadSaved(source: () => Promise<unknown>, label: string, saved = false): Promise<void> {
    const request = ++this.displayRequest;
    this.panel?.setStatus(`Loading ${label}…`);
    try {
      const blueprint = readBlueprint(await source());
      await nextFrame();
      if (request !== this.displayRequest) return;
      this.installBlueprint(blueprint, saved);
      this.panel?.setStatus(`${blueprint.parcels.length} parcels loaded.`);
      this.notifications.info(`${label} loaded.`);
    } catch (error) {
      if (request === this.displayRequest) this.notifications.error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private installBlueprint(blueprint: CityBlueprint, saved: boolean): void {
    this.nav.show('visualization');
    this.inspector.close();
    this.map.setBlueprint(blueprint);
    if (this.mode === '3d') {
      this.map3d.setBlueprint(blueprint);
      this.pending3d = null;
    } else this.pending3d = blueprint;
    this.blueprint = blueprint;
    this.cities.setBlueprint(blueprint, saved);
    this.exteriors.setBlueprint(blueprint);
    this.overview.setBlueprint(blueprint);
    this.toolbar.setBlueprint(blueprint);
    void this.loadInteriorManifest(blueprint);
  }

  /** Fits the map to its pane. */
  resize(): void {
    this.map.resize(this.mapWrap.clientWidth, this.mapWrap.clientHeight);
    this.map3d.resize(this.mapWrap.clientWidth, this.mapWrap.clientHeight);
  }

  /** Flat map or the city in three dimensions; the 3D view starts drawing the first time it is shown. */
  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.visualizationForm?.set('mode', mode);
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

  /** Applies exact assembled interior ids to both map renderers and the filter label. */
  setInteriorParcels(parcelIds: readonly string[]): void {
    const valid = this.blueprint
      ? parcelIds.filter((id) => this.blueprint!.parcels.some((parcel) => parcel.id === id))
      : [...parcelIds];
    this.map.setInteriorParcels(valid);
    this.map3d.setInteriorParcels(valid);
    this.visualizationForm?.setInteriorCount(valid.length);
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
      this.panel?.setParams(parseParams(await file.text()));
      this.notifications.info(`${file.name} loaded into the form, press Generate`);
    } catch (e) {
      this.notifications.error(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private scheduleManifestLoad(): void {
    if (this.manifestTimer !== null) clearTimeout(this.manifestTimer);
    this.manifestTimer = setTimeout(() => {
      this.manifestTimer = null;
      if (this.blueprint) void this.loadInteriorManifest(this.blueprint);
    }, 200);
  }

  private async loadInteriorManifest(blueprint: CityBlueprint): Promise<void> {
    const request = ++this.manifestRequest;
    this.map.setInteriorParcels([]);
    this.map3d.setInteriorParcels([]);
    this.visualizationForm?.setInteriorCount(null);
    const parcel = blueprint.parcels[0];
    if (!parcel) return;
    const destination = this.parcelLink.manifestFor(parcel, blueprint.meta.seed);
    if ('error' in destination) return;
    try {
      const response = await this.fetchManifest(destination.url);
      if (!response.ok) return;
      const manifest = await response.json();
      if (request !== this.manifestRequest || this.blueprint !== blueprint || !isWorldManifest(manifest)) return;
      const blueprintParcels = new Set(blueprint.parcels.map((item) => item.id));
      if (manifest.seed !== blueprint.meta.seed
        || manifest.atlasVersion !== blueprint.meta.version
        || manifest.parcels.length !== blueprintParcels.size
        || !manifest.parcels.every((id) => blueprintParcels.has(id))) return;
      this.setInteriorParcels(manifest.interiors);
    } catch {
      // An assembled output is optional. The filter fails closed until one is available.
    }
  }
}

export type ManifestFetcher = (url: string) => Promise<Pick<Response, 'ok' | 'json'>>;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
