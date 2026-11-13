// Shared helpers for sandbox scripts: connect with the local test keys, call and view contracts, move time.
import { connect, keyStores, KeyPair, utils } from 'near-api-js';
import { readFileSync, writeFileSync } from 'node:fs';
const gasMax = {};
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const keys = JSON.parse(readFileSync(process.env.RULECARD_KEYS ?? join(here, '.keys', 'keys.json'), 'utf8'));
export const NEAR = n => BigInt(utils.format.parseNearAmount(String(n)));
export const TOKEN = 10n ** 18n;
// NEAR reserves far more NEAR than the gas costs for a big attach (300 Tgas holds back ~0.3 NEAR on testnet), so attach what a call needs.
const HEAVY = new Set(['create_coin', 'launch_raid', 'settle_raid', 'raid_accept', 'raid_finish']); // cross-contract calls
const gasFor = m => (HEAVY.has(m) ? 300n : 100n) * 1_000_000_000_000n;

// Public testnet RPCs rate-limit (HTTP 429) and near-api-js doesn't retry that: space requests out and back off on 429.
// RULECARD_RPC_GAP_MS overrides the spacing (default 250 ms on testnet, none on the local sandbox).
const GAP = Number(process.env.RULECARD_RPC_GAP_MS ?? (keys.networkId === 'testnet' ? 250 : 0));
const realFetch = globalThis.fetch; let lastReq = 0;
const nap = ms => new Promise(r => setTimeout(r, ms));
globalThis.fetch = async (...a) => {
  for (let i = 0; ; i++) {
    if (GAP) { const wait = Math.max(0, lastReq + GAP - Date.now()); lastReq = Date.now() + wait; if (wait) await nap(wait); }
    const init = a[1] ?? {};
    const r = await realFetch(a[0], { ...init, signal: init.signal ?? AbortSignal.timeout(45_000) }); // a hung request must not freeze a long-running loop
    if (r.status !== 429 || i >= 8) return r;
    await nap(1000 * 1.6 ** i);
  }
};

const ks = new keyStores.InMemoryKeyStore();
for (const a of Object.values(keys.accounts)) await ks.setKey(keys.networkId, a.accountId, KeyPair.fromString(a.secretKey));
export const near = await connect({ networkId: keys.networkId, nodeUrl: keys.nodeUrl, keyStore: ks });
const cache = {};
export const acct = async name => (cache[name] ||= await near.account(keys.accounts[name].accountId));
export const idOf = name => keys.accounts[name].accountId;
export const coinId = (symbol, mode = 'real') => `${symbol.toLowerCase()}.${keys.factories[mode]}`;

export async function call(name, contractId, methodName, args = {}, deposit = 0n) {
  const a = await acct(name);
  const r = await a.functionCall({ contractId, methodName, args, gas: gasFor(methodName), attachedDeposit: deposit });
  if (process.env.RULECARD_GAS_LOG) { // gas probe: remember the most gas each method has burned (Tgas, summed over all receipts)
    const g = [r.transaction_outcome, ...(r.receipts_outcome ?? [])].reduce((t, o) => t + BigInt(o.outcome.gas_burnt), 0n);
    const t = Number(g / 10n ** 9n) / 1000; gasMax[methodName] = Math.max(gasMax[methodName] ?? 0, t);
    writeFileSync(process.env.RULECARD_GAS_LOG, JSON.stringify(gasMax, null, 1));
  }
  const v = r.status?.SuccessValue; return v ? JSON.parse(Buffer.from(v, 'base64').toString()) : null;
}
export async function view(contractId, methodName, args = {}) { const a = await acct(keys.accounts.you ? 'you' : Object.keys(keys.accounts)[0]); return a.viewFunction({ contractId, methodName, args }); }
export async function rpc(method, params) {
  const r = await (await fetch(keys.nodeUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json();
  if (r.error) throw new Error(JSON.stringify(r.error)); return r.result;
}
export async function chainNow() { return Number((await rpc('block', { finality: 'final' })).header.timestamp_nanosec) / 1e6; }
/** Sandbox only: produce blocks until the chain clock has moved `minutes`. */
export async function forward(minutes) {
  const target = (await chainNow()) + minutes * 60_000;
  for (let i = 0; i < 8 && (await chainNow()) < target; i++) await rpc('sandbox_fast_forward', { delta_height: Math.ceil((target - (await chainNow())) / 1000) + 5 });
}
export const errMsg = e => { const m = String(e?.message ?? e); const k = m.match(/Smart contract panicked: ([^"\n]*)/); return k ? k[1] : m.slice(0, 200); };
