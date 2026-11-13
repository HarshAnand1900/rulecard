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

// Dev-only: serves api/fund.mjs (the practice-mode sponsor) with a SANDBOX account as the sponsor, so the practice flow can be
// tested against the local chain without spending any testnet NEAR. On a real host the function runs as api/fund.mjs.
function sandboxFund(): Plugin {
  const file = resolve(__dirname, 'sandbox/.keys/keys.json');
  return {
    name: 'sandbox-fund', apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/fund', async (req, res) => {
        if (!existsSync(file)) { res.statusCode = 404; res.end('{"error":"run node sandbox/deploy.mjs"}'); return; }
        const k = JSON.parse(readFileSync(file, 'utf8')), sponsor = k.accounts.you;
        Object.assign(process.env, { FUND_ACCOUNT_ID: sponsor.accountId, FUND_PRIVATE_KEY: sponsor.secretKey, FUND_NETWORK_ID: k.networkId, FUND_RPC: k.nodeUrl, FUND_AMOUNT_NEAR: '0.5', FUND_KEEP_NEAR: '10', FUND_PER_IP_HOUR: '1000' });
        const mod = await server.ssrLoadModule('/api/fund.mjs');
        await mod.default(req, res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), sandboxKeys(), sandboxFund()],
  // near-api-js expects Node's Buffer in the browser
  resolve: { alias: { buffer: 'buffer/' } },
  optimizeDeps: { include: ['buffer', 'near-api-js'] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  // two pages: the landing at the root (static, plus public/ files) and the app at /play/
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), play: resolve(__dirname, 'play/index.html') } } },
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts'] },
});
