import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { createCityApi } from './src/cities';
import type { CityApi } from './src/cities/schema';

/** Mounts the cities box on the preview's existing HTTP server. */
export function citiesPreview(dataDir: string): Plugin {
  let api: CityApi | undefined;
  async function mount(server: ViteDevServer | PreviewServer): Promise<void> {
    api = await createCityApi({
      dataDir,
      workerUrl: pathToFileURL(resolve('dist/city-worker.mjs')),
    });
    const mounted = api;
    server.middlewares.use(mounted.handle);
    server.httpServer?.once('close', () => {
      void mounted.close().catch(error => server.config.logger.error(String(error)));
    });
  }
  return {
    name: 'atlas-cities',
    configureServer: mount,
    configurePreviewServer: mount,
    async closeBundle() { await api?.close(); },
  };
}
