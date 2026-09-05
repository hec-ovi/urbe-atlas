import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AtlasParams } from '../../schema/params';
import type { CityRecord, GeneratedCity } from './schema';
import { CityApiError } from './errors';

export class DiskCityStore {
  private readonly records = new Map<string, CityRecord>();
  readonly directory: string;

  constructor(directory: string) {
    this.directory = resolve(directory);
  }

  async load(): Promise<void> {
    try {
      await mkdir(this.directory, { recursive: true });
      for (const entry of await readdir(this.directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
        const text = await readFile(join(this.directory, entry.name, 'record.json'), 'utf8').catch(error => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
          throw error;
        });
        if (text === undefined) continue;
        const record = JSON.parse(text) as CityRecord;
        if (record.id !== entry.name || record.stage !== 'blueprint' ||
            !['generated', 'imported'].includes(record.source) ||
            !['queued', 'running', 'ready', 'failed'].includes(record.status) ||
            (typeof record.seed !== 'string' && typeof record.seed !== 'number') ||
            !record.params || typeof record.params !== 'object' || Array.isArray(record.params) ||
            typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt)) ||
            typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt)) ||
            (record.status === 'ready' && (!record.stats || record.blueprintUrl !== `/api/cities/${record.id}/blueprint`)) ||
            (record.status === 'failed' && (!record.error || typeof record.error.message !== 'string'))) {
          throw new Error('Invalid catalog record.');
        }
        this.records.set(record.id, record);
      }
    } catch {
      throw new CityApiError('E_STORAGE', 'The city catalog could not be opened.', 500);
    }
  }

  list(): CityRecord[] {
    return [...this.records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  get(id: string): CityRecord {
    const record = this.records.get(id);
    if (!record) throw new CityApiError('E_NOT_FOUND', 'City not found.', 404);
    return record;
  }

  create(params: AtlasParams, source: CityRecord['source']): CityRecord {
    const now = new Date().toISOString();
    return {
      id: randomUUID(), source, seed: params.seed, params, stage: 'blueprint',
      status: 'queued', createdAt: now, updatedAt: now,
    };
  }

  async save(record: CityRecord): Promise<void> {
    await this.write(record.id, 'record.json', JSON.stringify(record));
    this.records.set(record.id, record);
  }

  async complete(record: CityRecord, result: GeneratedCity): Promise<CityRecord> {
    await this.write(record.id, 'blueprint.json', result.json);
    const now = new Date().toISOString();
    const ready: CityRecord = {
      ...record, status: 'ready', updatedAt: now, completedAt: now,
      stats: result.stats, blueprintUrl: `/api/cities/${record.id}/blueprint`,
    };
    await this.save(ready);
    return ready;
  }

  blueprintPath(id: string): string {
    this.get(id);
    return join(this.directory, id, 'blueprint.json');
  }

  private async write(id: string, name: string, text: string): Promise<void> {
    const directory = join(this.directory, id);
    const temporary = join(directory, `${name}.${randomUUID()}.tmp`);
    try {
      await mkdir(directory, { recursive: true });
      const file = await open(temporary, 'wx');
      try {
        await file.writeFile(text, 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, join(directory, name));
    } catch {
      await unlink(temporary).catch(() => undefined);
      throw new CityApiError('E_STORAGE', 'The city could not be saved.', 500);
    }
  }
}
