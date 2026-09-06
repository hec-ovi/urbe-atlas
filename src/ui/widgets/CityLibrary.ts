import type { AtlasParams } from '../../../schema/params';
import type { CityRecord } from '../../cities/schema';
import { CityGeneration } from '../components/CityGeneration';
import type { GenerationProgress } from '../../../schema/progress';
import { CityApi } from '../components/CityApi';
import { el } from '../components/dom';

interface LibraryEvents {
  onOpen: (record: CityRecord) => void;
  onRetry: (params: AtlasParams) => void;
  onStatus: (message: string) => void;
  onInfo: (message: string) => void;
  onError: (message: string) => void;
}

/** Saved city controls and server job observation. */
export class CityLibrary {
  readonly root: HTMLElement;
  private readonly api = new CityApi();
  private readonly list = el('ul', { class: 'city-list', 'aria-label': 'Saved cities' });
  private readonly status = el('p', { class: 'hint', role: 'status', text: 'Refresh to load saved cities.' });
  private readonly refreshButton = el('button', { type: 'button', text: 'Refresh cities' });
  private readonly removed = new Set<string>();
  private readonly records = new Map<string, CityRecord>();
  private generation?: CityGeneration;
  private busy = false;
  private confirmId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly events: LibraryEvents) {
    this.refreshButton.addEventListener('click', () => void this.refresh());
    this.root = el('section', { class: 'city-library', 'aria-label': 'City library' }, [
      el('h2', { text: 'Cities' }),
      el('p', { class: 'section-note', text: 'Open a ready city to inspect it. Delete removes it from this server.' }),
      this.refreshButton,
      this.status, this.list,
    ]);
  }

  async refresh(): Promise<void> {
    this.refreshButton.disabled = true;
    try {
      for (const record of await this.api.list()) this.accept(record);
      this.status.textContent = this.records.size ? 'Cities are stored on this server.' : 'No saved cities yet. Generate a city to get started.';
      this.render();
    } catch (error) {
      this.status.textContent = `City list unavailable: ${message(error)}. Refresh to reconnect.`;
    } finally {
      this.refreshButton.disabled = false;
      this.schedulePoll();
    }
  }

  async generate(params: AtlasParams, onProgress: (progress: GenerationProgress) => void, connection: (message: string) => void): Promise<CityRecord> {
    this.generation = new CityGeneration(this.api);
    return this.generation.run(params, record => {
      this.accept(record);
      this.render();
      this.events.onStatus(describe(record));
      onProgress(record.progress ?? { completed: 0, total: 13, phase: describe(record) });
    }, connection);
  }

  async cancelGeneration(): Promise<void> {
    const id = await this.generation?.cancel();
    if (id) { this.removed.add(id); this.records.delete(id); this.render(); }
  }

  blueprintFor(record: CityRecord, signal?: AbortSignal): Promise<unknown> {
    return this.api.blueprint(record.id, signal);
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.render();
  }

  private accept(record: CityRecord): void {
    if (this.removed.has(record.id)) return;
    const previous = this.records.get(record.id);
    if (previous && (previous.updatedAt > record.updatedAt || !pending(previous) && pending(record))) return;
    this.records.set(record.id, record);
  }

  private schedulePoll(): void {
    if (this.timer !== undefined || ![...this.records.values()].some(pending)) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.root.isConnected) void this.poll();
    }, 1500);
  }

  private async poll(): Promise<void> {
    const jobs = [...this.records.values()].filter(pending);
    const results = await Promise.allSettled(jobs.map((job) => this.api.status(job.id)));
    const failures: string[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') this.accept(result.value);
      else failures.push(message(result.reason));
    }
    this.status.textContent = failures.length
      ? `Status unavailable: ${failures[0]}. Reconnecting; Refresh cities retries now.`
      : 'Cities are stored on this server.';
    this.render();
    this.schedulePoll();
  }

  private async remove(record: CityRecord): Promise<void> {
    if (this.confirmId !== record.id) {
      this.confirmId = record.id;
      this.render();
      return;
    }
    this.confirmId = null;
    try {
      await this.api.remove(record.id);
      this.removed.add(record.id);
      this.records.delete(record.id);
      this.status.textContent = this.records.size ? 'Cities are stored on this server.' : 'No saved cities yet. Generate a city to get started.';
      this.render();
      this.events.onInfo(`City ${String(record.seed)} deleted.`);
    } catch (error) {
      this.events.onError(`Delete city: ${message(error)}`);
    }
  }

  private render(): void {
    const rows = [...this.records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((record) => {
      const action = el('button', { type: 'button', text: record.status === 'failed' ? 'Retry' : 'Open',
        'aria-label': `${record.status === 'failed' ? 'Retry' : 'Open'} city ${String(record.seed)}` });
      action.disabled = record.status !== 'ready' && (record.status !== 'failed' || this.busy);
      action.addEventListener('click', () => {
        if (record.status === 'ready') this.events.onOpen(record);
        else if (record.status === 'failed') this.events.onRetry(record.params);
      });
      const remove = el('button', {
        type: 'button', class: this.confirmId === record.id ? 'danger-button' : '',
        text: this.confirmId === record.id ? 'Confirm delete' : 'Delete',
        'aria-label': `${this.confirmId === record.id ? 'Confirm delete' : 'Delete'} city ${String(record.seed)}`,
      });
      remove.addEventListener('click', () => void this.remove(record));
      return el('li', { class: 'city-row', 'data-city-id': record.id, 'data-status': record.status }, [
        el('div', { class: 'city-details' }, [
          el('strong', { text: String(record.seed) }),
          el('span', { class: 'city-state', text: describe(record) }),
          el('span', { class: 'city-meta', text: `${record.params.size ? `${record.params.size.width} × ${record.params.size.depth} m` : 'Size unspecified'} · ${record.source === 'generated' ? 'Generated' : 'Imported'}` }),
          el('time', { dateTime: record.createdAt, text: new Date(record.createdAt).toLocaleString() }),
          ...(record.error ? [el('span', { class: 'city-error', text: `${record.error.code}: ${record.error.message}` })] : []),
        ]),
        el('div', { class: 'city-actions' }, [action, remove]),
      ]);
    });
    this.list.replaceChildren(...rows);
  }
}

function pending(record: CityRecord): boolean { return record.status === 'queued' || record.status === 'running'; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function describe(record: CityRecord): string {
  return { queued: 'Queued for blueprint generation', running: 'Building blueprint on server', ready: 'Blueprint ready', failed: 'Blueprint generation failed' }[record.status];
}
