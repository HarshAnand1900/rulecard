import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Dev-only: serves the local sandbox test keys written by sandbox/deploy.mjs. Never part of a build.
function sandboxKeys(): Plugin {
  const file = resolve(__dirname, 'sandbox/.keys/keys.json');
  return {
    name: 'sandbox-keys', apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__sandbox/keys', (_req, res) => {
        if (!existsSync(file)) { res.statusCode = 404; res.end('{"error":"run node sandbox/deploy.mjs"}'); return; }
        res.setHeader('content-type', 'application/json'); res.end(readFileSync(file));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), sandboxKeys()],
  // near-api-js expects Node's Buffer in the browser
  resolve: { alias: { buffer: 'buffer/' } },
  optimizeDeps: { include: ['buffer', 'near-api-js'] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts'] },
});
