import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// Copies worker.js into the build as _worker.js. Cloudflare Pages runs that file on its
// servers: it answers /api/describe (keeping API keys secret) and serves the app for everything else.
// The named exports in worker.js exist only for the tests; Cloudflare expects just the default export.
function toWorker(source: string): string {
  return source.replace(/^export (async )?function/gm, (_m, a: string | undefined) => `${a ?? ''}function`);
}

function cloudflareWorker(): Plugin {
  return {
    name: 'cloudflare-worker',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_worker.js', source: toWorker(readFileSync('worker.js', 'utf8')) });
    },
  };
}

export default defineConfig({
  plugins: [react(), cloudflareWorker()],
  publicDir: false,
  test: {
    environment: 'jsdom',
    setupFiles: ['./test-setup.ts'],
    css: false,
    exclude: ['node_modules', 'dist'],
  },
});
