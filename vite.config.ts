import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { outDir: 'dist/preview' },
  test: { runner: './test/runtime/CooperativeRunner.ts' },
});
