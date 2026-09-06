import type { AtlasParams } from '../../schema/params';
import { CityApiError, generationError, interruptedError } from './errors';
import { DiskCityStore } from './DiskCityStore';
import type { CityGenerator, CityRecord } from './schema';

export class CityQueue {
  private readonly pending: string[] = [];
  private active?: Promise<void>;
  private controller?: AbortController;
  private runningId?: string;
  private stopped = false;
  private storageFailure?: CityApiError;

  constructor(private readonly store: DiskCityStore, private readonly generate: CityGenerator) {}

  async start(): Promise<void> {
    for (const record of this.store.list().reverse()) {
      if (record.status === 'running') {
        await this.store.save({
          ...record, status: 'failed', updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(), error: interruptedError(),
        });
      } else if (record.status === 'queued') this.pending.push(record.id);
    }
    this.runNext();
  }

  async submit(params: AtlasParams): Promise<CityRecord> {
    if (this.storageFailure) throw this.storageFailure;
    if (this.stopped) throw new CityApiError('E_INTERRUPTED', 'The city service is shutting down.', 503);
    const record = this.store.create(params, 'generated');
    await this.store.save(record);
    this.pending.push(record.id);
    this.runNext();
    return record;
  }

  async close(): Promise<void> {
    this.stopped = true;
    this.controller?.abort();
    await this.active;
  }

  async remove(id: string): Promise<void> {
    this.store.get(id);
    const index = this.pending.indexOf(id);
    if (index >= 0) this.pending.splice(index, 1);
    if (this.runningId === id) {
      this.controller?.abort();
      await this.active;
    }
    await this.store.remove(id);
  }

  private runNext(): void {
    if (this.active || this.stopped || this.storageFailure) return;
    const id = this.pending.shift();
    if (!id) return;
    this.controller = new AbortController();
    this.runningId = id;
    this.active = this.run(id, this.controller.signal).catch(() => {
      this.storageFailure = new CityApiError('E_STORAGE', 'The city catalog could not be updated.', 500);
    }).finally(() => {
      this.active = undefined;
      this.controller = undefined;
      this.runningId = undefined;
      this.runNext();
    });
  }

  private async run(id: string, signal: AbortSignal): Promise<void> {
    const now = new Date().toISOString();
    const record: CityRecord = { ...this.store.get(id), status: 'running', startedAt: now, updatedAt: now };
    await this.store.save(record);
    try {
      if (signal.aborted) throw interruptedError();
      const result = await this.generate(record.params, signal, progress => {
        if (signal.aborted || !this.store.has(id)) return;
        record.progress = progress;
        record.updatedAt = new Date().toISOString();
        this.store.observe({ ...record });
      });
      if (signal.aborted) throw interruptedError();
      if (!this.store.has(id)) return;
      await this.store.complete(record, result);
    } catch (error) {
      if (!this.store.has(id)) return;
      const now = new Date().toISOString();
      await this.store.save({
        ...record, status: 'failed', updatedAt: now, completedAt: now,
        error: error instanceof CityApiError && error.code === 'E_STORAGE'
          ? { code: error.code, message: error.message }
          : signal.aborted ? interruptedError() : generationError(error),
      });
    }
  }
}
