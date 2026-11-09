// Shared helpers for sandbox scripts: connect with the local test keys, call and view the contract, move time.
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

export async function call(name, methodName, args = {}, deposit = 0n) {
  const a = await acct(name);
  const r = await a.functionCall({ contractId: keys.contractId, methodName, args, gas: GAS, attachedDeposit: deposit });
  const v = r.status?.SuccessValue; return v ? JSON.parse(Buffer.from(v, 'base64').toString()) : null;
}
export async function view(methodName, args = {}) { const a = await acct('you'); return a.viewFunction({ contractId: keys.contractId, methodName, args }); }
export async function rpc(method, params) {
  const r = await (await fetch(keys.nodeUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json();
  if (r.error) throw new Error(JSON.stringify(r.error)); return r.result;
}
export async function chainTime() { const s = await rpc('status', []); return Math.floor(Number(s.sync_info.latest_block_time ? Date.parse(s.sync_info.latest_block_time) : 0)); }
export const errMsg = e => { const m = String(e?.message ?? e); const k = m.match(/Smart contract panicked: ([^"\n]*)/); return k ? k[1] : m.slice(0, 200); };
