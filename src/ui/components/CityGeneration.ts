import type { AtlasParams } from '../../../schema/params';
import type { CityRecord } from '../../cities/schema';
import { abortable } from './abortable';
import { CityApi } from './CityApi';

/** Owns one server job from submission through completion or confirmed worker removal. */
export class CityGeneration {
  private submission?: Promise<CityRecord>;
  private cancellation?: Promise<void>;
  private cancelled = false;
  private readonly stopped = new AbortController();
  private wake?: () => void;

  constructor(private readonly api: CityApi) {}

  async run(params: AtlasParams, observe: (record: CityRecord) => void, connection: (message: string) => void): Promise<CityRecord> {
    this.cancelled = false;
    this.submission = this.api.create(params);
    let record = await this.submission;
    for (;;) {
      await this.cancellation;
      if (this.cancelled) throw new DOMException('Generation cancelled.', 'AbortError');
      observe(record);
      if (record.status === 'failed') throw new Error(`${record.error!.code}: ${record.error!.message}`);
      if (record.status === 'ready') return record;
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => { this.wake = undefined; resolve(); }, 400);
        this.wake = () => { clearTimeout(timer); this.wake = undefined; resolve(); };
      });
      await this.cancellation;
      if (this.cancelled) throw new DOMException('Generation cancelled.', 'AbortError');
      try { record = await abortable(this.api.status(record.id, this.stopped.signal), this.stopped.signal); }
      catch (error) {
        await this.cancellation;
        if (this.cancelled) throw new DOMException('Generation cancelled.', 'AbortError');
        connection(`Connection interrupted. Retrying: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  async cancel(): Promise<string | undefined> {
    if (!this.submission) return;
    const submission = this.submission;
    let id: string | undefined;
    const cancellation = (async () => {
      const record = await submission;
      id = record.id;
      await this.api.remove(record.id);
      this.cancelled = true;
      this.stopped.abort();
    })();
    // The observer keeps waiting if cancellation could not reach the server.
    this.cancellation = cancellation.catch(() => undefined);
    this.wake?.();
    try { await cancellation; return id; }
    finally { this.cancellation = undefined; this.wake?.(); }
  }
}
