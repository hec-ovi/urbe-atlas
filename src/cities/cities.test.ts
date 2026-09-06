import { createServer, type Server } from 'node:http';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import type { CityBlueprint } from '../../schema/blueprint';
import { createCityApi } from './index';
import type { CityApi, CityApiOptions, CityGenerator, CityRecord, GeneratedCity } from './schema';

const directories: string[] = [];
const servers: Array<{ api: CityApi; server: Server }> = [];

afterEach(async () => {
  for (const { api, server } of servers.splice(0)) {
    await api.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'atlas-cities-test-'));
  directories.push(path);
  return path;
}

async function serve(options: CityApiOptions) {
  const api = await createCityApi(options);
  const server = createServer((request, response) => api.handle(request, response, () => {
    response.writeHead(404);
    response.end('outside city API');
  }));
  servers.push({ api, server });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No HTTP test port.');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    api,
    request: (path: string, options?: RequestInit) => fetch(`${base}${path}`, options),
    post: (body: unknown, path = '/api/cities') => fetch(`${base}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  };
}

function result(seed: string): GeneratedCity {
  return { json: `{"seed":"${seed}","unchanged":[1,2,3]}\n`, stats: { population: 12, parcelCounts: {} as CityBlueprint['stats']['parcelCounts'], perDistrict: [] } };
}

class ControlledGenerator {
  readonly calls: Array<{ seed: string | number; resolve: (result: GeneratedCity) => void; reject: (error: unknown) => void }> = [];
  readonly generate: CityGenerator = (params, signal) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    this.calls.push({ seed: params.seed, resolve, reject });
  });
}

async function eventually<T>(read: () => Promise<T>, accept: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 3000;
  do {
    const value = await read();
    if (accept(value)) return value;
    await setTimeout(5);
  } while (Date.now() < deadline);
  throw new Error('City API did not reach the expected state.');
}

async function status(app: Awaited<ReturnType<typeof serve>>, id: string, expected: CityRecord['status']): Promise<CityRecord> {
  return eventually(async () => (await app.request(`/api/cities/${id}`)).json() as Promise<CityRecord>, record => record.status === expected);
}

function blueprint() {
  return {
    meta: { version: '0.17.0', seed: 'saved', params: { seed: 'saved' }, bounds: { min: [0, 0], max: [400, 400] },
      units: 'meters', gridAngle: 0, boundary: [[0, 0], [400, 0], [400, 400], [0, 400]] },
    districts: [], blocks: [], parcels: [],
    streets: { nodes: [], edges: [], crossings: [], signals: [], planting: [], highwayStructures: [] },
    transit: { busStops: [], busRoutes: [], trainStations: [], trainLines: [], subwayStations: [], subwayLines: [] },
    volumetric: { buildings: [], ground: [] }, stats: { population: 0, parcelCounts: {}, perDistrict: [] },
    extraSavedField: { exact: [0.000000001, 'retained'] },
  };
}

describe('city HTTP catalog', () => {
  it('persists submissions, runs one job, serves pending reads and retains exact completed JSON after restart', async () => {
    const dataDir = await directory();
    const generator = new ControlledGenerator();
    const app = await serve({ dataDir, generator: generator.generate });
    const response = await app.post({ seed: 'same', irregularity: 0 });
    expect(response.status).toBe(202);
    const first = await response.json() as CityRecord;
    expect(first).toMatchObject({ source: 'generated', seed: 'same', stage: 'blueprint', status: 'queued', params: { seed: 'same', irregularity: 0 } });
    expect(response.headers.get('location')).toBe(`/api/cities/${first.id}`);
    await status(app, first.id, 'running');
    const second = await (await app.post({ seed: 'same' })).json() as CityRecord;
    expect(second.id).not.toBe(first.id);
    expect((await app.request(`/api/cities/${first.id}/blueprint`)).status).toBe(409);
    const list = await (await app.request('/api/cities')).json();
    expect(list.cities.map((city: CityRecord) => [city.id, city.status])).toEqual([[second.id, 'queued'], [first.id, 'running']]);
    expect(generator.calls).toHaveLength(1);
    generator.calls[0].resolve(result('same'));
    const ready = await status(app, first.id, 'ready');
    expect(ready).toMatchObject({ blueprintUrl: `/api/cities/${first.id}/blueprint`, stats: { population: 12 } });
    await status(app, second.id, 'running');
    expect(generator.calls).toHaveLength(2);
    generator.calls[1].resolve(result('second'));
    await status(app, second.id, 'ready');
    expect(await (await app.request(ready.blueprintUrl!)).text()).toBe(result('same').json);
    await app.api.close();
    const restart = await serve({ dataDir, generator: async () => { throw new Error('Completed cities must not regenerate.'); } });
    expect((await (await restart.request('/api/cities')).json()).cities).toHaveLength(2);
    expect(await (await restart.request(ready.blueprintUrl!)).text()).toBe(result('same').json);
  });

  it('keeps HTTP available while its real Node worker is CPU-bound', async () => {
    const dataDir = await directory();
    const release = join(dataDir, 'release-worker');
    const app = await serve({ dataDir, workerUrl: new URL('./test.worker.mjs', import.meta.url) });
    const first = await (await app.post({ seed: release })).json() as CityRecord;
    await status(app, first.id, 'running');
    await eventually(() => access(`${release}.started`).then(() => true, () => false), Boolean);
    const second = await (await app.post({ seed: release })).json() as CityRecord;
    expect((await (await app.request('/api/cities')).json()).cities).toHaveLength(2);
    expect((await (await app.request(`/api/cities/${second.id}`)).json()).status).toBe('queued');
    await writeFile(release, 'ready');
    await status(app, first.id, 'ready');
    await status(app, second.id, 'ready');
  });

  it('imports saved blueprints with all fields intact and without invoking generation', async () => {
    const dataDir = await directory();
    const app = await serve({ dataDir, generator: async () => { throw new Error('Imports must not generate.'); } });
    const saved = blueprint();
    const exactJson = `${JSON.stringify(saved, null, 2)}\n`;
    const response = await app.request('/api/cities/import', { method: 'POST', body: exactJson });
    expect(response.status).toBe(201);
    const record = await response.json() as CityRecord;
    expect(record).toMatchObject({ source: 'imported', stage: 'blueprint', status: 'ready', seed: 'saved' });
    expect(await (await app.request(record.blueprintUrl!)).json()).toEqual(saved);
    expect(await (await app.request(record.blueprintUrl!)).text()).toBe(exactJson);
    await app.api.close();
    const restart = await serve({ dataDir });
    expect(await (await restart.request(record.blueprintUrl!)).text()).toBe(exactJson);
  });

  it('recovers queued jobs and marks running work interrupted after a restart', async () => {
    const dataDir = await directory();
    const generator = new ControlledGenerator();
    const app = await serve({ dataDir, generator: generator.generate });
    const first = await (await app.post({ seed: 'interrupted' })).json() as CityRecord;
    const running = await status(app, first.id, 'running');
    const queued = await (await app.post({ seed: 'queued' })).json() as CityRecord;
    await app.api.close();
    expect((await (await app.request(`/api/cities/${first.id}`)).json()).error.code).toBe('E_INTERRUPTED');
    expect((await app.post({ seed: 'during-shutdown' })).status).toBe(503);
    // Recreate the committed running record left by an abrupt process exit.
    await writeFile(join(dataDir, first.id, 'record.json'), JSON.stringify(running));
    const restart = await serve({ dataDir, generator: async params => result(String(params.seed)) });
    expect((await status(restart, first.id, 'failed')).error?.code).toBe('E_INTERRUPTED');
    await status(restart, queued.id, 'ready');
    expect(await (await restart.request(`/api/cities/${queued.id}/blueprint`)).text()).toBe(result('queued').json);
  });

  it('retains generation errors and continues to the next queued city', async () => {
    const failures = [
      { code: 'E_INVALID_PARAMS', message: 'Invalid features.', details: { field: 'features' } },
      { code: 'E_UNSATISFIABLE', message: 'City cannot fit.' },
      { code: 'E_INVARIANT', message: 'Geometry invariant failed.' },
      { code: 'E_GENERATION', message: 'Worker unavailable.' },
    ];
    const app = await serve({ dataDir: await directory(), generator: async () => { throw failures.shift(); } });
    for (const code of ['E_INVALID_PARAMS', 'E_UNSATISFIABLE', 'E_INVARIANT', 'E_GENERATION']) {
      const record = await (await app.post({ seed: code })).json() as CityRecord;
      const failed = await status(app, record.id, 'failed');
      expect(failed.error?.code).toBe(code);
      if (code === 'E_INVALID_PARAMS') expect(failed.error?.details).toEqual({ field: 'features' });
      if (code === 'E_GENERATION') expect(failed.error?.message).toBe('Worker unavailable.');
    }
  });

  it('returns request, missing-city and storage errors through HTTP', async () => {
    const dataDir = await directory();
    const app = await serve({ dataDir, generator: async () => result('valid') });
    for (const input of [null, {}, { seed: {} }]) {
      const response = await app.post(input);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('E_BAD_REQUEST');
    }
    expect((await app.request('/api/cities', { method: 'POST', body: '{' })).status).toBe(400);
    expect((await app.post({ meta: {} }, '/api/cities/import')).status).toBe(400);
    expect((await app.request('/api/cities', { method: 'DELETE' })).status).toBe(400);
    const missing = await app.request('/api/cities/00000000-0000-0000-0000-000000000000');
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe('E_NOT_FOUND');
    expect(await (await app.request('/outside')).text()).toBe('outside city API');
    const record = await (await app.post({ seed: 'valid' })).json() as CityRecord;
    await status(app, record.id, 'ready');
    await rm(join(dataDir, record.id, 'blueprint.json'));
    const missingFile = await app.request(`/api/cities/${record.id}/blueprint`);
    expect(missingFile.status).toBe(500);
    expect((await missingFile.json()).error.code).toBe('E_STORAGE');
  });

  it('rejects a corrupt catalog and tolerates uncommitted directories', async () => {
    const dataDir = await directory();
    const id = '00000000-0000-0000-0000-000000000000';
    await mkdir(join(dataDir, id));
    const app = await serve({ dataDir });
    expect((await (await app.request('/api/cities')).json()).cities).toEqual([]);
    await app.api.close();
    await writeFile(join(dataDir, id, 'record.json'), '{');
    await expect(createCityApi({ dataDir })).rejects.toMatchObject({ code: 'E_STORAGE' });
    expect(await readFile(join(dataDir, id, 'record.json'), 'utf8')).toBe('{');
  });

  it('serves creation and visualization form documents', async () => {
    const app = await serve({ dataDir: await directory() });
    const list = await (await app.request('/api/forms')).json();
    expect(list).toEqual({ forms: ['creation', 'visualization'] });
    const creation = await (await app.request('/api/forms/creation')).json();
    expect(creation.id).toBe('creation');
    expect(creation.layout).toEqual({ type: 'split', ratio: [70, 30], items: ['form', 'cities'] });
    expect(creation.values.seed).toBe('urbe');
    expect(JSON.stringify(creation.form)).toContain('"type":"slider"');
    const visualization = await (await app.request('/api/forms/visualization')).json();
    expect(visualization.id).toBe('visualization');
    expect(JSON.stringify(visualization.form)).toContain('"type":"layers"');
    expect((await app.request('/api/forms/unknown')).status).toBe(404);
    expect((await app.request('/api/forms', { method: 'POST' })).status).toBe(400);
  });

  it('deletes queued, ready and running cities', async () => {
    const dataDir = await directory();
    const generator = new ControlledGenerator();
    const app = await serve({ dataDir, generator: generator.generate });
    const running = await (await app.post({ seed: 'run' })).json() as CityRecord;
    await status(app, running.id, 'running');
    const queued = await (await app.post({ seed: 'queued' })).json() as CityRecord;
    expect((await app.request(`/api/cities/${queued.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await app.request(`/api/cities/${queued.id}`)).status).toBe(404);
    generator.calls[0].resolve(result('run'));
    await status(app, running.id, 'ready');
    expect((await app.request(`/api/cities/${running.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await (await app.request('/api/cities')).json()).cities).toEqual([]);
    await expect(access(join(dataDir, running.id))).rejects.toMatchObject({ code: 'ENOENT' });
    const live = await (await app.post({ seed: 'live' })).json() as CityRecord;
    await status(app, live.id, 'running');
    expect((await app.request(`/api/cities/${live.id}`, { method: 'DELETE' })).status).toBe(204);
    generator.calls[1].resolve(result('live'));
    expect((await app.request(`/api/cities/${live.id}`)).status).toBe(404);
    expect((await app.request('/api/cities/00000000-0000-0000-0000-000000000000', { method: 'DELETE' })).status).toBe(404);
  });
});
