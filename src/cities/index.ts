import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CityQueue } from './CityQueue';
import { DiskCityStore } from './DiskCityStore';
import { HttpCityApi } from './HttpCityApi';
import { WorkerGenerator } from './WorkerGenerator';
import type { CityApi, CityApiOptions } from './schema';

export async function createCityApi(options: CityApiOptions = {}): Promise<CityApi> {
  const store = new DiskCityStore(options.dataDir ?? process.env.ATLAS_CITY_DATA_DIR ?? '.atlas-cities');
  await store.load();
  const worker = new WorkerGenerator(options.workerUrl ?? pathToFileURL(resolve('dist/city-worker.mjs')));
  const queue = new CityQueue(store, options.generator ?? worker.generate.bind(worker));
  await queue.start();
  const http = new HttpCityApi(store, queue);
  return { handle: http.handle.bind(http), close: () => queue.close() };
}

export type { CityApi, CityApiOptions, CityRecord, CityList, CityErrorResponse, FormList, FormName, WorkspaceForm } from './schema';
