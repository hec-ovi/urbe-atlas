import type { AtlasParams } from '../../../schema/params';
import type { CityBlueprint } from '../../../schema/blueprint';
import type { CityRecord } from '../../cities/schema';
import { CityApi } from '../components/CityApi';
import { el } from '../components/dom';

interface LibraryEvents {
  onOpen: (record: CityRecord) => void;
  onRetry: (params: AtlasParams) => void;
  onStatus: (message: string) => void;
  onInfo: (message: string) => void;
  onError: (message: string) => void;
}

/** Saved city controls, server job observation and explicit blueprint persistence. */
export class CityLibrary {
  readonly root: HTMLElement;
  private readonly api = new CityApi();
  private readonly list = el('ul', { class: 'city-list', 'aria-label': 'Saved cities' });
  private readonly status = el('p', { class: 'hint', role: 'status', text: 'Refresh to load saved cities.' });
  private readonly save = el('button', { type: 'button', text: 'Save current city', disabled: '' });
  private readonly refreshButton = el('button', { type: 'button', text: 'Refresh cities' });
  private readonly records = new Map<string, CityRecord>();
  private readonly waiters = new Map<string, (record: CityRecord) => void>();
  private blueprint: CityBlueprint | null = null;
  private saved = false;
  private saving = false;
  private busy = false;
  private confirmId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly events: LibraryEvents) {
    this.refreshButton.addEventListener('click', () => void this.refresh());
    this.save.addEventListener('click', () => void this.saveCurrent());
    this.root = el('section', { class: 'city-library', 'aria-label': 'City library' }, [
      el('h2', { text: 'Cities' }),
      el('p', { class: 'section-note', text: 'Open a ready city to inspect it. Delete removes it from this server.' }),
      el('div', { class: 'button-row' }, [this.refreshButton, this.save]),
      this.status, this.list,
    ]);
  }

  async refresh(): Promise<void> {
    this.refreshButton.disabled = true;
    try {
      for (const record of await this.api.list()) this.accept(record);
      this.status.textContent = this.records.size ? 'Cities are stored on this server.' : 'No saved cities yet. Generate a city or open a blueprint and save it.';
      this.render();
    } catch (error) {
      this.status.textContent = `City list unavailable: ${message(error)}. Refresh to reconnect.`;
    } finally {
      this.refreshButton.disabled = false;
      this.schedulePoll();
    }
  }

  async generate(params: AtlasParams): Promise<CityRecord> {
    this.events.onStatus(`Submitting blueprint for ${String(params.seed)}…`);
    let record = await this.api.create(params);
    this.accept(record);
    this.render();
    if (pending(record)) {
      this.events.onStatus(describe(record));
      const completion = new Promise<CityRecord>((resolve) => this.waiters.set(record.id, resolve));
      this.schedulePoll();
      record = await completion;
    }
    if (record.status === 'failed') throw new Error(`${record.error!.code}: ${record.error!.message}`);
    return record;
  }

  blueprintFor(record: CityRecord): Promise<unknown> {
    return this.api.blueprint(record.id);
  }

  setBlueprint(blueprint: CityBlueprint, saved: boolean): void {
    this.blueprint = blueprint;
    this.saved = saved;
    this.updateSave();
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.render();
  }

  private accept(record: CityRecord): void {
    const previous = this.records.get(record.id);
    if (previous && (previous.updatedAt > record.updatedAt || !pending(previous) && pending(record))) return;
    this.records.set(record.id, record);
    const resolve = this.waiters.get(record.id);
    if (resolve) {
      this.events.onStatus(describe(record));
      if (!pending(record)) {
        this.waiters.delete(record.id);
        resolve(record);
      }
    }
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

  private async saveCurrent(): Promise<void> {
    const blueprint = this.blueprint;
    if (!blueprint || this.saved || this.saving) return;
    this.saving = true;
    this.updateSave();
    try {
      const record = await this.api.import(blueprint);
      this.accept(record);
      if (this.blueprint === blueprint) this.saved = true;
      this.status.textContent = 'Cities are stored on this server.';
      this.render();
      this.events.onInfo(`City ${String(record.seed)} saved.`);
    } catch (error) {
      this.events.onError(`Save city: ${message(error)}`);
    } finally {
      this.saving = false;
      this.updateSave();
    }
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
      this.records.delete(record.id);
      this.waiters.delete(record.id);
      this.status.textContent = this.records.size ? 'Cities are stored on this server.' : 'No saved cities yet. Generate a city or open a blueprint and save it.';
      this.render();
      this.events.onInfo(`City ${String(record.seed)} deleted.`);
    } catch (error) {
      this.events.onError(`Delete city: ${message(error)}`);
    }
  }

  private updateSave(): void {
    this.save.disabled = !this.blueprint || this.saved || this.saving;
    this.save.textContent = this.saving ? 'Saving city…' : this.saved ? 'Current city saved' : 'Save current city';
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
