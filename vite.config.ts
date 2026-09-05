import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { resolve } from 'node:path';
import { citiesPreview } from './citiesPreview';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const cityDataDir = resolve(env.ATLAS_CITY_DATA_DIR || '.atlas-cities');
  return {
    plugins: mode === 'test' ? [] : [citiesPreview(cityDataDir)],
    server: {
      watch: { ignored: [`${cityDataDir}/**`] },
      proxy: {
        '^/api/exteriors(?:/|$)': {
          target: env.ATLAS_ENGINE_API_URL || 'http://127.0.0.1:5306',
          changeOrigin: true,
        },
      },
    },
    build: { outDir: 'dist/preview' },
    test: { runner: './test/runtime/CooperativeRunner.ts' },
  };
});
