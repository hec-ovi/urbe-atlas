import type { AtlasParams } from '../../../schema/params';
import type { CityBlueprint } from '../../../schema/blueprint';
import type { CityRecord, WorkspaceForm } from '../../cities/schema';

const API = '/api/cities';

/** Same-origin transport for durable city records and saved blueprints. */
export class CityApi {
  async list(): Promise<CityRecord[]> {
    const value = await this.request(API);
    if (!object(value) || !Array.isArray(value.cities)) throw new Error('Invalid city list response');
    return value.cities.map(readRecord);
  }

  async form(name: string): Promise<WorkspaceForm> {
    const value = await this.request(`/api/forms/${encodeURIComponent(name)}`);
    if (!object(value) || (value.id !== 'creation' && value.id !== 'visualization') || !Array.isArray(value.form)) {
      throw new Error('Invalid workspace form response');
    }
    return value as unknown as WorkspaceForm;
  }

  async create(params: AtlasParams): Promise<CityRecord> {
    const record = readRecord(await this.post(API, params));
    if (record.seed !== params.seed || record.source !== 'generated') throw new Error('Created city does not match the submitted parameters');
    return record;
  }

  async import(blueprint: CityBlueprint): Promise<CityRecord> {
    const record = readRecord(await this.post(`${API}/import`, blueprint));
    if (record.status !== 'ready' || record.source !== 'imported' || record.seed !== blueprint.meta.seed) throw new Error('Saved city does not match the displayed blueprint');
    return record;
  }

  async status(id: string): Promise<CityRecord> {
    const record = readRecord(await this.request(`${API}/${encodeURIComponent(id)}`));
    if (record.id !== id) throw new Error('City status belongs to another city');
    return record;
  }

  blueprint(id: string): Promise<unknown> {
    return this.request(`${API}/${encodeURIComponent(id)}/blueprint`);
  }

  async remove(id: string): Promise<void> {
    const response = await fetch(`${API}/${encodeURIComponent(id)}`, {
      method: 'DELETE', mode: 'same-origin', redirect: 'error', cache: 'no-store',
    });
    if (response.status === 204) return;
    const value: unknown = await response.json().catch(() => null);
    const error = object(value) && object(value.error) ? value.error : null;
    throw new Error(error && typeof error.message === 'string'
      ? `${String(error.code)}: ${error.message}` : `City request failed (${response.status})`);
  }

  private post(url: string, value: unknown): Promise<unknown> {
    return this.request(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    });
  }

  private async request(url: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(url, { ...init, mode: 'same-origin', redirect: 'error', cache: 'no-store' });
    const value: unknown = await response.json();
    if (!response.ok) {
      const error = object(value) && object(value.error) ? value.error : null;
      throw new Error(error && typeof error.message === 'string'
        ? `${String(error.code)}: ${error.message}` : `City request failed (${response.status})`);
    }
    return value;
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readRecord(value: unknown): CityRecord {
  if (!object(value) || typeof value.id !== 'string' || !/^[a-z0-9-]+$/i.test(value.id)
    || !['generated', 'imported'].includes(String(value.source)) || value.stage !== 'blueprint'
    || !['queued', 'running', 'ready', 'failed'].includes(String(value.status))
    || !(typeof value.seed === 'string' || typeof value.seed === 'number' && Number.isFinite(value.seed))
    || !object(value.params) || value.params.seed !== value.seed
    || value.params.size !== undefined && (!object(value.params.size)
      || typeof value.params.size.width !== 'number' || !Number.isFinite(value.params.size.width)
      || typeof value.params.size.depth !== 'number' || !Number.isFinite(value.params.size.depth))
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
    || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))
    || value.status === 'ready' && value.blueprintUrl !== `${API}/${value.id}/blueprint`
    || value.status === 'failed' && (!object(value.error) || typeof value.error.code !== 'string' || typeof value.error.message !== 'string')) {
    throw new Error('Invalid city record response');
  }
  return value as unknown as CityRecord;
}
