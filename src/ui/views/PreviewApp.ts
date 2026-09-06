/** City creation and saved blueprint inspection with independent building steps. */
import type { AtlasParams } from '../../../schema/params';
import type { CityBlueprint } from '../../../schema/blueprint';
import type { CityRecord, WorkspaceForm } from '../../cities/schema';
import { AtlasError } from '../../errors';
import { MapView } from './MapView';
import { Map3DView } from './Map3DView';
import { WorkspaceHeader } from './WorkspaceHeader';
import { GenerationDialog } from '../widgets/GenerationDialog';
import type { ViewMode } from '../widgets/ViewModeSwitch';
import { LegendWidget } from '../widgets/LegendWidget';
import { ParamsPanel } from '../widgets/ParamsPanel';
import { ParcelLink } from '../widgets/ParcelLink';
import { CityLibrary } from '../widgets/CityLibrary';
import { BlueprintOverview } from '../widgets/BlueprintOverview';
import { InspectorPanel } from '../widgets/InspectorPanel';
import { MapToolbar } from '../widgets/MapToolbar';
import { ExteriorPreview } from '../widgets/ExteriorPreview';
import { abortable } from '../components/abortable';
import { CityApi } from '../components/CityApi';
import { Form } from '../components/Form';
import { downloadBlueprint } from '../components/blueprintFile';
import { readBlueprint } from '../components/blueprintInput';
import { isWorldManifest } from '../components/worldManifest';
import { parseParams } from '../components/paramsFile';
import { el } from '../components/dom';
import type { Filters } from './filters';

export class PreviewApp {
  readonly root: HTMLElement;
  readonly ready: Promise<void>;
  private readonly inspector: InspectorPanel;
  private readonly exteriors: ExteriorPreview;
  private readonly map: MapView;
  private readonly map3d: Map3DView;
  private readonly header: WorkspaceHeader;
  private readonly progress: GenerationDialog;
  private mode: ViewMode = '2d';
  private panel: ParamsPanel | null = null;
  private visualizationForm: Form | null = null;
  private readonly parcelLink: ParcelLink;
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
  private cancellation: Promise<void> | null = null;
  private generationCancelled = false;
  private generationAbort?: AbortController;
  private displayRequest = 0;
  private manifestRequest = 0;
  private manifestTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly fetchManifest: ManifestFetcher = (url) => fetch(url)) {
    this.parcelLink = new ParcelLink();
    this.inspector = new InspectorPanel(
      (parcel) => this.exteriors.destinationFor(parcel),
      () => this.map.clearSelection(),
    );
    this.exteriors = new ExteriorPreview(() => this.inspector.refresh(), (message) => this.report(message));
    this.map = new MapView((hit) => { this.inspector.select(hit); });
    this.map3d = new Map3DView((parcel) => { this.inspector.select({ kind: 'parcel', parcel }); });
    this.cities = new CityLibrary({
      onOpen: (record) => void this.openCity(record),
      onRetry: (params) => void this.generate(params),
      onStatus: (message) => this.panel?.setStatus(message),
      onInfo: (message) => this.report(message),
      onError: (message) => this.report(message),
    });
    this.parcelLink.onChange(() => {
      this.inspector.refresh();
      this.scheduleManifestLoad();
    });
    this.header = new WorkspaceHeader(() => this.showCreation());
    this.progress = new GenerationDialog(() => void this.cancelGeneration());
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
    this.root.append(this.header.root, this.creationPane, this.visualizationPane, this.progress.root);
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

  private showWorkspace(name: 'creation' | 'visualization'): void {
    this.creationPane.hidden = name !== 'creation';
    this.visualizationPane.hidden = name !== 'visualization';
    if (name === 'visualization') requestAnimationFrame(() => this.resize());
  }

  showCreation(updateUrl = true): void {
    if (this.generating) return;
    ++this.displayRequest;
    this.panel?.newSeed();
    this.header.message.textContent = '';
    this.showWorkspace('creation');
    if (updateUrl) history.pushState(null, '', window.location.pathname);
  }

  private report(message: string): void { this.header.message.textContent = message; }

  /** Keeps the workspace locked until the server finishes or confirms worker cancellation. */
  async generate(params: AtlasParams): Promise<void> {
    await this.ready;
    if (this.generating) return;
    let validated: AtlasParams;
    try { validated = parseParams(JSON.stringify(params)); }
    catch (error) { this.report(error instanceof Error ? error.message : String(error)); return; }
    this.generating = true;
    this.generationCancelled = false;
    this.generationAbort = new AbortController();
    this.header.message.textContent = '';
    this.panel?.setBusy(true);
    this.cities.setBusy(true);
    this.setWorkspaceInert(true);
    this.progress.show();
    try {
      const record = await this.cities.generate(validated,
        progress => this.progress.update(progress), message => this.progress.report(message));
      await this.cancellation;
      if (!this.generationCancelled) await this.openCity(record, true, this.generationAbort.signal);
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'AbortError';
      const message = cancelled ? 'Generation cancelled.'
        : error instanceof AtlasError ? `${error.code}: ${error.message}`
        : error instanceof Error ? error.message : String(error);
      this.panel?.setStatus(message);
      this.report(message);
    } finally {
      await this.cancellation;
      this.panel?.setBusy(false);
      this.cities.setBusy(false);
      this.generating = false;
      this.setWorkspaceInert(false);
      this.progress.close();
    }
  }

  private setWorkspaceInert(value: boolean): void {
    for (const pane of [this.header.root, this.creationPane, this.visualizationPane]) pane.inert = value;
  }

  private async cancelGeneration(): Promise<void> {
    if (this.cancellation) return;
    this.progress.setCancelling(true);
    this.generationCancelled = true;
    ++this.displayRequest;
    this.cancellation = this.cities.cancelGeneration().then(() => {
      this.generationAbort?.abort();
      this.panel?.setStatus('Generation cancelled.');
      this.report('Generation cancelled.');
    }).catch(error => {
      this.generationCancelled = false;
      this.progress.report(`Could not stop the server job. Retry Cancel. ${error instanceof Error ? error.message : String(error)}`);
      this.progress.setCancelling(false);
    });
    await this.cancellation;
    this.cancellation = null;
  }

  refreshCities(): Promise<void> { return this.cities.refresh(); }

  async openCityId(id: string): Promise<void> {
    try {
      const record = await this.api.status(id);
      if (record.status !== 'ready') throw new Error(record.error?.message ?? 'This city is still being generated.');
      await this.openCity(record, false);
    } catch (error) { this.report(error instanceof Error ? error.message : String(error)); }
  }

  private async openCity(record: CityRecord, updateUrl = true, signal?: AbortSignal): Promise<void> {
    const loaded = await this.loadSaved(() => this.cities.blueprintFor(record, signal), `City ${String(record.seed)}`, signal);
    if (loaded && updateUrl) {
      const query = new URLSearchParams({ city: record.id });
      if (this.mode === '3d') query.set('view', '3d');
      history.pushState(null, '', `${window.location.pathname}?${query}`);
    }
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

  private async loadSaved(source: () => Promise<unknown>, label: string, signal?: AbortSignal): Promise<boolean> {
    const request = ++this.displayRequest;
    this.panel?.setStatus(`Loading ${label}…`);
    try {
      const blueprint = readBlueprint(await abortable(source(), signal));
      await abortable(nextFrame(), signal);
      if (request !== this.displayRequest) return false;
      this.installBlueprint(blueprint);
      this.panel?.setStatus(`${blueprint.parcels.length} parcels loaded.`);
      return true;
    } catch (error) {
      if (request === this.displayRequest) this.report(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private installBlueprint(blueprint: CityBlueprint): void {
    this.showWorkspace('visualization');
    this.inspector.close();
    this.map.setBlueprint(blueprint);
    if (this.mode === '3d') {
      this.map3d.setBlueprint(blueprint);
      this.pending3d = null;
    } else this.pending3d = blueprint;
    this.blueprint = blueprint;
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
    downloadBlueprint(this.blueprint);
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
