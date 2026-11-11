// Shared helpers for sandbox scripts: connect with the local test keys, call and view contracts, move time.
import { connect, keyStores, KeyPair, utils } from 'near-api-js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const keys = JSON.parse(readFileSync(join(here, '.keys', 'keys.json'), 'utf8'));
export const NEAR = n => BigInt(utils.format.parseNearAmount(String(n)));
export const TOKEN = 10n ** 18n;
const GAS = 300_000_000_000_000n;

const ks = new keyStores.InMemoryKeyStore();
for (const a of Object.values(keys.accounts)) await ks.setKey(keys.networkId, a.accountId, KeyPair.fromString(a.secretKey));
export const near = await connect({ networkId: keys.networkId, nodeUrl: keys.nodeUrl, keyStore: ks });
const cache = {};
export const acct = async name => (cache[name] ||= await near.account(keys.accounts[name].accountId));
export const idOf = name => keys.accounts[name].accountId;
export const coinId = (symbol, mode = 'real') => `${symbol.toLowerCase()}.${keys.factories[mode]}`;

export async function call(name, contractId, methodName, args = {}, deposit = 0n) {
  const a = await acct(name);
  const r = await a.functionCall({ contractId, methodName, args, gas: GAS, attachedDeposit: deposit });
  const v = r.status?.SuccessValue; return v ? JSON.parse(Buffer.from(v, 'base64').toString()) : null;
}
export async function view(contractId, methodName, args = {}) { const a = await acct('you'); return a.viewFunction({ contractId, methodName, args }); }
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
