// Browser client. Local sandbox: uses the test keys the dev server exposes (localhost only).
import './polyfill';
import { connect, keyStores, KeyPair, Account } from 'near-api-js';

export interface Keys { nodeUrl: string; networkId: string; factories: { real: string; demo: string }; protocolId: string; accounts: Record<string, { accountId: string; secretKey: string }>; }
export const TOKEN = 10n ** 18n;
export const YOCTO = 10n ** 24n;
const GAS = 300_000_000_000_000n;

/** yocto NEAR (string or bigint) → number of NEAR */
export const toNear = (y: string | bigint) => Number(BigInt(y) / 10n ** 18n) / 1e6;
/** token base units → whole tokens */
export const toTok = (t: string | bigint) => Number(BigInt(t) / 10n ** 15n) / 1e3;
export const nearToYocto = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 18n;
export const tokToUnits = (n: number) => BigInt(Math.round(n * 1e3)) * 10n ** 15n;
export const fmtTok = (t: number) => (t >= 1e6 ? (t / 1e6).toFixed(2) + 'M' : t >= 1e3 ? (t / 1e3).toFixed(1) + 'k' : t.toFixed(t < 10 ? 2 : 0));
export const fmtNear = (n: number) => (n >= 1000 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2));

export class Chain {
  private accounts: Record<string, Account> = {};
  constructor(public keys: Keys) {}
  static async open(): Promise<Chain> {
    const r = await fetch('/__sandbox/keys');
    if (!r.ok) throw new Error('No sandbox keys. Run ./sandbox/start.sh, node sandbox/deploy.mjs and node sandbox/seed.mjs');
    const keys: Keys = await r.json();
    if (!keys.factories) throw new Error('Old sandbox keys. Run ./sandbox/reset.sh, ./sandbox/start.sh, node sandbox/deploy.mjs');
    const ch = new Chain(keys);
    const ks = new keyStores.InMemoryKeyStore();
    for (const a of Object.values(keys.accounts)) await ks.setKey(keys.networkId, a.accountId, KeyPair.fromString(a.secretKey as any));
    const near = await connect({ networkId: keys.networkId, nodeUrl: keys.nodeUrl, keyStore: ks });
    for (const [n, a] of Object.entries(keys.accounts)) ch.accounts[n] = await near.account(a.accountId);
    return ch;
  }
  players() { return Object.keys(this.keys.accounts).filter(n => !n.startsWith('factory')); }
  id(name: string) { return this.keys.accounts[name].accountId; }
  view<T = any>(contractId: string, methodName: string, args: object = {}): Promise<T> { return this.accounts.you.viewFunction({ contractId, methodName, args }); }
  async call<T = any>(name: string, contractId: string, methodName: string, args: object = {}, deposit = 0n): Promise<T> {
    try {
      const r: any = await this.accounts[name].functionCall({ contractId, methodName, args, gas: GAS, attachedDeposit: deposit });
      const v = r.status?.SuccessValue; return v ? JSON.parse(atob(v)) : (null as T);
    } catch (e: any) {
      const m = String(e?.message ?? e); const k = m.match(/Smart contract panicked: ([^"\\]*)/);
      throw new Error(k ? k[1] : m.slice(0, 160));
    }
  }
  async balance(name: string) { const b = await this.accounts[name].getAccountBalance(); return toNear(b.available); }
  async rpc(method: string, params: any) {
    const r = await (await fetch(this.keys.nodeUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json();
    if (r.error) throw new Error(JSON.stringify(r.error)); return r.result;
  }
  async chainNow(): Promise<number> { const b = await this.rpc('block', { finality: 'final' }); return Math.floor(Number(b.header.timestamp_nanosec) / 1e6); }
  /** Sandbox only: move the chain clock forward, then poke every coin so timers fire. */
  async fastForward(minutes: number, coins: string[]) {
    const target = (await this.chainNow()) + minutes * 60_000;
    for (let i = 0; i < 8; i++) {
      const left = target - (await this.chainNow()); if (left <= 0) break;
      await this.rpc('sandbox_fast_forward', { delta_height: Math.max(5, Math.ceil(left / 1000) + 5) });
    }
    for (const c of coins) await this.call('bot12', c, 'poke');
  }
}
