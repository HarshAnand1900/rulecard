// One interface for both networks the app runs on:
// - sandbox: the local NEAR sandbox, signing with local test keys (dev only), with a player switcher and a clock you can move;
// - testnet: real wallets through NEAR Wallet Selector (MyNearWallet, Meteor); views go straight to the RPC.
import { Chain, toNear } from './near';
import { ONE_TAP_METHODS, oneTapKeyName, newOneTapKey, oneTapAddKeyAction, callWithOneTapKey } from './onetap';
import type { WalletSelector } from '@near-wallet-selector/core';
import type { WalletSelectorModal } from '@near-wallet-selector/modal-ui';
// wallet code is loaded only on testnet (see openNet)
let functionCall: (m: string, a: object, g: bigint, d: bigint) => any;
let toNajAction: (a: any) => any;

// NEAR reserves much more than the gas costs for a big attach (300 Tgas holds back ~0.3 NEAR), so attach what a call needs.
const HEAVY = ['create_coin', 'launch_raid', 'settle_raid']; // cross-contract calls
const gasFor = (m: string) => (HEAVY.includes(m) ? 300n : 100n) * 1_000_000_000_000n;

export type Scale = 'demo' | 'real';
const SCALE_KEY = 'rulecard-scale';
const savedScale = (): Scale => { try { return localStorage.getItem(SCALE_KEY) === 'real' ? 'real' : 'demo'; } catch { return 'demo'; } };

export interface Net {
  mode: 'sandbox' | 'testnet';
  /** demo = game NEAR ÷100 and time ÷12 (its own factory); real = full-size numbers */
  scale: Scale;
  scales: Scale[];
  setScale(s: Scale): void;
  factoryId: string;
  me(): string | null;
  view<T = any>(contractId: string, method: string, args?: object): Promise<T>;
  call<T = any>(contractId: string, method: string, args?: object, deposit?: bigint): Promise<T>;
  coinId(symbol: string): string;
  balance(): Promise<number>;
  /** account facts for the Proof page: balance, storage, code hash and how many access keys it has */
  accountInfo(account: string): Promise<{ amount: string; storageUsage: number; codeHash: string; keys: number }>;
  // sandbox only
  players?(): string[];
  player?: string;
  setPlayer?(name: string): void;
  fastForward?(minutes: number, coins: string[]): Promise<void>;
  // testnet only
  signIn?(): void;
  signOut?(): Promise<void>;
  onChange?(fn: () => void): void;
  /** one-tap: a limited key for one coin lets gm, packs, backing and Battle cry skip the wallet popup (testnet only) */
  oneTapReady?(coin: string): boolean;
  enableOneTap?(coin: string): Promise<void>;
  disableOneTap?(coin: string): void;
}

const panicText = (e: any) => { const m = String(e?.message ?? e); const k = m.match(/Smart contract panicked: ([^"\\]*)/); return k ? k[1] : m.slice(0, 160); };

class SandboxNet implements Net {
  mode = 'sandbox' as const;
  player = 'you';
  scale: Scale = savedScale();
  scales: Scale[] = ['demo', 'real'];
  constructor(private ch: Chain) {}
  setScale(s: Scale) { this.scale = s; try { localStorage.setItem(SCALE_KEY, s); } catch { /* ignore */ } }
  get factoryId() { return this.ch.keys.factories[this.scale]; }
  me() { return this.ch.id(this.player); }
  view<T>(c: string, m: string, a: object = {}) { return this.ch.view<T>(c, m, a); }
  call<T>(c: string, m: string, a: object = {}, d = 0n) { return this.ch.call<T>(this.player, c, m, a, d); }
  coinId(s: string) { return `${s.toLowerCase()}.${this.factoryId}`; }
  balance() { return this.ch.balance(this.player); }
  async accountInfo(account: string) {
    const [a, k] = await Promise.all([this.ch.rpc('query', { request_type: 'view_account', finality: 'final', account_id: account }), this.ch.rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: account })]);
    return { amount: a.amount, storageUsage: a.storage_usage, codeHash: a.code_hash, keys: k.keys.length };
  }
  players() { return this.ch.players(); }
  setPlayer(n: string) { this.player = n; }
  fastForward(min: number, coins: string[]) { return this.ch.fastForward(min, coins); }
}

class WalletNet implements Net {
  mode = 'testnet' as const;
  private account: string | null = null;
  private listeners: (() => void)[] = [];
  scale: Scale;
  scales: Scale[];
  constructor(private factories: Partial<Record<Scale, string>>, private nodeUrl: string, private selector: WalletSelector, private modal: WalletSelectorModal) {
    this.scales = (['demo', 'real'] as Scale[]).filter(s => factories[s]);
    const want = savedScale(); this.scale = this.scales.includes(want) ? want : this.scales[0];
    const sync = () => { this.account = selector.store.getState().accounts.find(a => a.active)?.accountId ?? null; this.listeners.forEach(f => f()); };
    sync(); selector.store.observable.subscribe(sync);
  }
  get factoryId() { return this.factories[this.scale]!; }
  setScale(s: Scale) { if (this.factories[s]) { this.scale = s; try { localStorage.setItem(SCALE_KEY, s); } catch { /* ignore */ } } }
  me() { return this.account; }
  onChange(fn: () => void) { this.listeners.push(fn); }
  private async rpc(method: string, params: any) {
    // public RPCs answer 429 when a page asks for a lot at once: back off and retry instead of failing the screen
    let res: Response | undefined;
    for (let i = 0; i < 5; i++) {
      res = await fetch(this.nodeUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'rc', method, params }) });
      if (res.status !== 429) break;
      await new Promise(r => setTimeout(r, 400 * 2 ** i));
    }
    const r = await res!.json();
    if (r.error) throw new Error(r.error?.data ?? r.error?.message ?? 'RPC error');
    if (r.result?.error) throw new Error(panicText(r.result.error));
    return r.result;
  }
  async view<T>(contractId: string, method: string, args: object = {}): Promise<T> {
    const r = await this.rpc('query', { request_type: 'call_function', finality: 'optimistic', account_id: contractId, method_name: method, args_base64: btoa(JSON.stringify(args)) });
    return JSON.parse(new TextDecoder().decode(new Uint8Array(r.result)));
  }
  async call<T>(contractId: string, method: string, args: object = {}, deposit = 0n): Promise<T> {
    if (!this.account) { this.signIn(); throw new Error('sign in first'); }
    // one-tap: no deposit, a listed method and a limited key for this coin: sign locally, no popup
    if (deposit === 0n && ONE_TAP_METHODS.includes(method) && this.oneTapReady(contractId)) {
      try {
        return await callWithOneTapKey({ nodeUrl: this.nodeUrl, networkId: 'testnet', accountId: this.account, secretKey: localStorage.getItem(oneTapKeyName(this.account, contractId))!, contractId, method, args });
      } catch (e) {
        const m = String((e as any)?.message ?? e);
        if (/panicked|ExecutionError|FunctionCallError/.test(m)) throw new Error(panicText(e));
        if (/does not exist|not found|AccessKey/i.test(m)) this.disableOneTap(contractId); // never registered, or removed: ask again
        // out of allowance, network hiccup, ...: fall through to the wallet
      }
    }
    const wallet = await this.selector.wallet();
    try {
      const out: any = await wallet.signAndSendTransaction({ receiverId: contractId, actions: [functionCall(method, args, gasFor(method), deposit)] });
      const v = out?.status?.SuccessValue; return v ? JSON.parse(atob(v)) : (null as T);
    } catch (e) { throw new Error(panicText(e)); }
  }
  coinId(s: string) { return `${s.toLowerCase()}.${this.factoryId}`; }
  async accountInfo(account: string) {
    const [a, k] = await Promise.all([this.rpc('query', { request_type: 'view_account', finality: 'final', account_id: account }), this.rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: account })]);
    return { amount: a.amount, storageUsage: a.storage_usage, codeHash: a.code_hash, keys: k.keys.length };
  }
  async balance() { if (!this.account) return 0; const r = await this.rpc('query', { request_type: 'view_account', finality: 'optimistic', account_id: this.account }); return toNear(r.amount); }
  oneTapReady(coin: string) { try { return !!this.account && !!localStorage.getItem(oneTapKeyName(this.account, coin)); } catch { return false; } }
  disableOneTap(coin: string) { try { if (this.account) localStorage.removeItem(oneTapKeyName(this.account, coin)); } catch { /* ignore */ } }
  /** One wallet approval adds a function-call key limited to this coin and the listed methods (never any deposit). */
  async enableOneTap(coin: string) {
    if (!this.account) { this.signIn(); throw new Error('sign in first'); }
    const k = newOneTapKey();
    // stored before the wallet opens: browser wallets redirect away and back, and the page reloads in between
    try { localStorage.setItem(oneTapKeyName(this.account, coin), k.secret); } catch { throw new Error('this browser blocks local storage, so one-tap cannot be saved'); }
    const wallet = await this.selector.wallet();
    try { await wallet.signAndSendTransaction({ receiverId: this.account, actions: [toNajAction(oneTapAddKeyAction(k.publicKey, coin))] }); }
    catch (e) { this.disableOneTap(coin); throw new Error(panicText(e)); }
  }
  signIn() { this.modal.show(); }
  async signOut() { const w = await this.selector.wallet(); await w.signOut(); }
}

/** Sandbox in dev unless VITE_NETWORK=testnet; testnet needs VITE_FACTORY_DEMO and/or VITE_FACTORY_REAL. */
export async function openNet(): Promise<Net> {
  const env = (import.meta as any).env ?? {};
  const mode = env.VITE_NETWORK ?? (env.DEV ? 'sandbox' : 'testnet');
  if (mode === 'sandbox') return new SandboxNet(await Chain.open());
  const factories: Partial<Record<Scale, string>> = { demo: env.VITE_FACTORY_DEMO, real: env.VITE_FACTORY_REAL };
  if (!factories.demo && !factories.real) throw new Error('Set VITE_FACTORY_DEMO and/or VITE_FACTORY_REAL to the testnet factory accounts.');
  const factoryId = (factories.demo ?? factories.real)!;
  const nodeUrl = env.VITE_NODE_URL ?? 'https://test.rpc.fastnear.com';
  const [core, ui, mnw, meteor] = await Promise.all([
    import('@near-wallet-selector/core'), import('@near-wallet-selector/modal-ui'),
    import('@near-wallet-selector/my-near-wallet'), import('@near-wallet-selector/meteor-wallet'), import('@near-wallet-selector/modal-ui/styles.css'),
  ]);
  functionCall = core.actionCreators.functionCall as any;
  toNajAction = core.internalActionToNaj as any;
  const selector = await core.setupWalletSelector({ network: 'testnet', modules: [mnw.setupMyNearWallet(), meteor.setupMeteorWallet()] });
  const modal = ui.setupModal(selector, { contractId: factoryId });
  return new WalletNet(factories, nodeUrl, selector, modal);
}
