import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => ({
  server: { proxy: { '^/api/exteriors(?:/|$)': {
    target: loadEnv(mode, process.cwd(), '').ATLAS_ENGINE_API_URL || 'http://127.0.0.1:5306',
    changeOrigin: true,
  } } },
  build: { outDir: 'dist/preview' },
  test: { runner: './test/runtime/CooperativeRunner.ts' },
}));
