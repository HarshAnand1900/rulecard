// Practice-mode sponsor: sends a little testnet NEAR to a brand-new practice wallet so the visitor can play with no wallet and no faucet.
// Runs as a Vercel Node function (api/fund.mjs) and, for local testing, behind the Vite dev server (see vite.config.ts).
//
// Environment (set these on the host; never commit them):
//   FUND_ACCOUNT_ID    the sponsor's testnet account, e.g. faucet.yourname.testnet (a separate account, not your main one)
//   FUND_PRIVATE_KEY   that account's full-access key, "ed25519:..."
//   FUND_NETWORK_ID    default "testnet"
//   FUND_RPC           RPC url(s), comma separated (default: FastNEAR testnet, then rpc.testnet.near.org)
//   FUND_AMOUNT_NEAR   sent to each new wallet (default 0.5)
//   FUND_KEEP_NEAR     the sponsor stops paying when its own balance would fall below this (default 1)
//   FUND_PER_IP_HOUR   how many wallets one visitor address can fund per hour (default 3)
//
// What it will and won't do: it only funds brand-new implicit accounts (a 64-character hex name), at most once each, at most
// FUND_AMOUNT_NEAR, and it stops when the sponsor is nearly empty. Testnet NEAR has no value; the worst abuse is draining the sponsor.
import { connect, keyStores, KeyPair, utils } from 'near-api-js';

const hits = new Map(); // ip -> [timestamps]; per warm instance, best effort

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  res.end(JSON.stringify(body));
};

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const env = process.env;
  if (!env.FUND_ACCOUNT_ID || !env.FUND_PRIVATE_KEY) return send(res, 503, { error: 'The practice faucet is not set up on this site: use your own wallet instead.' });

  const body = await readBody(req);
  const id = String(body.account_id ?? '');
  if (!/^[0-9a-f]{64}$/.test(id)) return send(res, 400, { error: 'account_id must be a 64-character implicit account name' });

  const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'unknown').split(',')[0].trim();
  const limit = Number(env.FUND_PER_IP_HOUR ?? 3), now = Date.now();
  const recent = (hits.get(ip) ?? []).filter(t => now - t < 3_600_000);
  if (recent.length >= limit) return send(res, 429, { error: 'Too many practice wallets from your address this hour: use your own wallet, or try later.' });

  try {
    const networkId = env.FUND_NETWORK_ID ?? 'testnet';
    const urls = (env.FUND_RPC ?? 'https://test.rpc.fastnear.com,https://rpc.testnet.near.org').split(',').map(s => s.trim()).filter(Boolean);
    const ks = new keyStores.InMemoryKeyStore();
    await ks.setKey(networkId, env.FUND_ACCOUNT_ID, KeyPair.fromString(env.FUND_PRIVATE_KEY));
    let near, lastErr;
    for (const nodeUrl of urls) { try { near = await connect({ networkId, nodeUrl, keyStore: ks }); await near.connection.provider.status(); break; } catch (e) { lastErr = e; near = undefined; } }
    if (!near) throw lastErr ?? new Error('no RPC answered');

    const amount = BigInt(utils.format.parseNearAmount(String(env.FUND_AMOUNT_NEAR ?? '0.5')));
    const keep = BigInt(utils.format.parseNearAmount(String(env.FUND_KEEP_NEAR ?? '1')));
    const sponsor = await near.account(env.FUND_ACCOUNT_ID);
    const bal = BigInt((await sponsor.getAccountBalance()).available);
    if (bal < amount + keep) return send(res, 503, { error: 'The practice faucet is empty right now: use your own testnet wallet instead.' });

    // already funded? (an account that exists with real money is left alone)
    try { const a = await near.connection.provider.query({ request_type: 'view_account', finality: 'final', account_id: id }); if (BigInt(a.amount) >= amount / 2n) return send(res, 200, { ok: true, already: true }); } catch { /* not created yet: that's the normal case */ }

    const out = await sponsor.sendMoney(id, amount);
    hits.set(ip, [...recent, now]);
    return send(res, 200, { ok: true, tx: out.transaction?.hash, amount: String(amount) });
  } catch (e) {
    return send(res, 502, { error: 'The practice faucet hit a network error: try again in a moment, or use your own wallet.', detail: String(e?.message ?? e).slice(0, 120) });
  }
}
