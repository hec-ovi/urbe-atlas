import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { CityQueue } from './CityQueue';
import { DiskCityStore } from './DiskCityStore';
import { CityApiError } from './errors';
import { Forms } from './forms/Forms';
import { cityParams, importedBlueprint } from './validation';

const BODY_LIMIT = 128 * 1024 * 1024;

export class HttpCityApi {
  constructor(private readonly store: DiskCityStore, private readonly queue: CityQueue) {}

  handle(request: IncomingMessage, response: ServerResponse, next: () => void): void {
    const path = (request.url ?? '/').split('?')[0];
    if (path !== '/api/cities' && !path.startsWith('/api/cities/') && path !== '/api/forms' && !path.startsWith('/api/forms/')) return next();
    void this.route(request, response, path).catch(error => {
      if (response.headersSent || response.destroyed) return;
      const failure = error instanceof CityApiError
        ? error : new CityApiError('E_STORAGE', 'The city catalog could not be read.', 500);
      this.json(response, failure.status, { error: { code: failure.code, message: failure.message } });
    });
  }

  private async route(request: IncomingMessage, response: ServerResponse, path: string): Promise<void> {
    if (path === '/api/forms' || path.startsWith('/api/forms/')) return this.form(request, response, path);
    if (path === '/api/cities') {
      if (request.method === 'GET') return this.json(response, 200, { cities: this.store.list() });
      if (request.method === 'POST') {
        const params = cityParams((await this.body(request)).value);
        const record = await this.queue.submit(params);
        response.setHeader('Location', `/api/cities/${record.id}`);
        return this.json(response, 202, record);
      }
      throw new CityApiError('E_BAD_REQUEST', 'Use GET or POST for the city catalog.', 400);
    }
    if (path === '/api/cities/import') {
      if (request.method !== 'POST') throw new CityApiError('E_BAD_REQUEST', 'Use POST to import a city.', 400);
      const body = await this.body(request);
      const blueprint = importedBlueprint(body.value);
      const record = this.store.create(blueprint.meta.params, 'imported');
      record.seed = blueprint.meta.seed;
      const ready = await this.store.complete(record, { json: body.json, stats: blueprint.stats });
      response.setHeader('Location', `/api/cities/${ready.id}`);
      return this.json(response, 201, ready);
    }
    const match = /^\/api\/cities\/([a-f0-9-]{36})(\/blueprint)?$/.exec(path);
    if (!match) throw new CityApiError('E_NOT_FOUND', 'City endpoint not found.', 404);
    if (request.method === 'DELETE') {
      if (match[2]) throw new CityApiError('E_BAD_REQUEST', 'Use DELETE /api/cities/:id to remove a city.', 400);
      await this.queue.remove(match[1]);
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method !== 'GET') throw new CityApiError('E_BAD_REQUEST', 'Use GET to read a city or DELETE to remove it.', 400);
    const record = this.store.get(match[1]);
    if (!match[2]) return this.json(response, 200, record);
    if (record.status !== 'ready') throw new CityApiError('E_NOT_READY', 'The city blueprint is not ready.', 409);
    const file = this.store.blueprintPath(record.id);
    const { size } = await stat(file);
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': size,
      'Cache-Control': 'no-store',
    });
    await pipeline(createReadStream(file), response);
  }

  private form(request: IncomingMessage, response: ServerResponse, path: string): void {
    if (request.method !== 'GET') throw new CityApiError('E_BAD_REQUEST', 'Use GET to read a workspace form.', 400);
    if (path === '/api/forms') return this.json(response, 200, { forms: Forms.names() });
    const name = path.slice('/api/forms/'.length);
    if (name.includes('/')) throw new CityApiError('E_NOT_FOUND', 'Form not found.', 404);
    return this.json(response, 200, Forms.get(name));
  }

  private body(request: IncomingMessage): Promise<{ value: unknown; json: string }> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let tooLarge = false;
      request.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > BODY_LIMIT) {
          if (!tooLarge) reject(new CityApiError('E_BAD_REQUEST', 'City JSON exceeds 128 MiB.', 400));
          tooLarge = true;
          chunks.length = 0;
        } else if (!tooLarge) chunks.push(chunk);
      });
      request.once('end', () => {
        if (tooLarge) return;
        try {
          const json = Buffer.concat(chunks).toString('utf8');
          resolve({ value: JSON.parse(json), json });
        }
        catch { reject(new CityApiError('E_BAD_REQUEST', 'Provide valid JSON.', 400)); }
      });
      request.once('error', () => reject(new CityApiError('E_BAD_REQUEST', 'The request body could not be read.', 400)));
      request.once('aborted', () => reject(new CityApiError('E_BAD_REQUEST', 'The request was interrupted.', 400)));
    });
  }

  private json(response: ServerResponse, status: number, value: unknown): void {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(value));
  }
}
