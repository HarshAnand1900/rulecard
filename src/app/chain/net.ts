// One interface for every way the app can talk to a chain:
// - sandbox:  the local NEAR sandbox, signing with local test keys (dev only), with a player switcher and a clock you can move;
// - practice: a throwaway wallet made in the browser and funded by a small sponsor endpoint (testnet; coins have no value);
// - wallet:   your own testnet account through NEAR Wallet Selector (MyNearWallet, Meteor).
import { connect, keyStores, KeyPair } from 'near-api-js';
import { Chain } from './near';
import { RpcClient, panicText } from './rpc';
import { ONE_TAP_METHODS, oneTapKeyName, newOneTapKey, oneTapAddKeyAction, callWithOneTapKey } from './onetap';
import type { WalletSelector } from '@near-wallet-selector/core';
import type { WalletSelectorModal } from '@near-wallet-selector/modal-ui';
// wallet code is loaded only in wallet mode (see openNet)
let functionCall: (m: string, a: object, g: bigint, d: bigint) => any;
let toNajAction: (a: any) => any;

// NEAR reserves much more than the gas costs for a big attach (300 Tgas holds back ~0.3 NEAR), so attach what a call needs.
const HEAVY = ['create_coin', 'launch_raid', 'settle_raid']; // cross-contract calls
const gasFor = (m: string) => (HEAVY.includes(m) ? 300n : 100n) * 1_000_000_000_000n;

export type Scale = 'demo' | 'real';
export type Door = 'practice' | 'wallet';
const SCALE_KEY = 'rulecard-scale', DOOR_KEY = 'rulecard-door';
const savedScale = (): Scale => { try { return localStorage.getItem(SCALE_KEY) === 'real' ? 'real' : 'demo'; } catch { return 'demo'; } };
export const savedDoor = (): Door | null => { try { const d = localStorage.getItem(DOOR_KEY); return d === 'practice' || d === 'wallet' ? d : null; } catch { return null; } };
export const saveDoor = (d: Door | null) => { try { if (d) localStorage.setItem(DOOR_KEY, d); else localStorage.removeItem(DOOR_KEY); } catch { /* ignore */ } };
const envOf = () => (import.meta as any).env ?? {};
/** A hosted testnet build shows the landing screen (two doors); the local sandbox never does. */
export const needsDoor = () => { const env = envOf(); return (env.VITE_NETWORK ?? (env.DEV ? 'sandbox' : 'testnet')) === 'testnet' || env.VITE_SHOW_LANDING === '1'; };

export type OnboardStep = 'wallet' | 'funding' | 'waiting' | 'ready';

export interface Net {
  mode: 'sandbox' | 'practice' | 'wallet';
  /** demo = game NEAR ÷100 and time ÷12 (its own factory); real = full-size numbers */
  scale: Scale;
  scales: Scale[];
  setScale(s: Scale): void;
  factoryId: string;
  /** base URL of a block explorer for links (null on the local sandbox) */
  explorer: string | null;
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
  // wallet only
  signIn?(): void;
  signOut?(): Promise<void>;
  onChange?(fn: () => void): void;
  /** one-tap: a limited key for one coin lets gm, packs, backing and Battle cry skip the wallet popup (wallet mode only) */
  oneTapReady?(coin: string): boolean;
  enableOneTap?(coin: string): Promise<void>;
  disableOneTap?(coin: string): void;
  // practice only
  /** make (or load) the practice wallet and get it funded; reports each step */
  ensureWallet?(onStep: (s: OnboardStep) => void): Promise<void>;
  exportKey?(): string | null;
  resetWallet?(): void;
  /** the last transaction hash of each kind of call (and 'fund'), for receipt links */
  receipts?: Record<string, { hash: string; at: number }>;
}

class SandboxNet implements Net {
  mode = 'sandbox' as const;
  player = 'you';
  explorer = null;
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

/** Practice mode: a throwaway wallet made in the browser. Its key is a plain full-access key kept in this browser only, funded by
 *  a small sponsor endpoint with a little testnet NEAR. Every call is a real transaction signed locally: no popups. */
export interface GuestConfig { factoryId: string; nodeUrls: string[]; networkId: string; fundUrl: string; explorer: string | null }
class GuestNet implements Net {
  mode = 'practice' as const;
  scale: Scale = 'demo';
  scales: Scale[] = ['demo'];
  factoryId: string;
  explorer: string | null;
  receipts: Record<string, { hash: string; at: number }> = {};
  private r: RpcClient;
  private kp: KeyPair | null = null;
  private account: string | null = null;
  constructor(private cfg: GuestConfig) {
    this.factoryId = cfg.factoryId; this.explorer = cfg.explorer; this.r = new RpcClient(cfg.nodeUrls);
    try { const s = localStorage.getItem(this.keyName()); if (s) this.adopt(KeyPair.fromString(s as any)); } catch { /* no saved wallet */ }
  }
  private keyName() { return `rulecard-practice:${this.cfg.networkId}`; }
  private adopt(kp: KeyPair) {
    this.kp = kp;
    // a NEAR "implicit" account: its name is the hex of its public key, and a plain transfer to it creates it
    this.account = Array.from((kp.getPublicKey() as any).data as Uint8Array).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  setScale() { /* practice always runs at demo scale */ }
  me() { return this.account; }
  view<T>(c: string, m: string, a: object = {}) { return this.r.view<T>(c, m, a); }
  coinId(s: string) { return `${s.toLowerCase()}.${this.factoryId}`; }
  accountInfo(account: string) { return this.r.accountInfo(account); }
  balance() { return this.account ? this.r.balanceOf(this.account) : Promise.resolve(0); }
  exportKey() { return this.kp ? this.kp.toString() : null; }
  resetWallet() { try { localStorage.removeItem(this.keyName()); } catch { /* ignore */ } this.kp = null; this.account = null; this.receipts = {}; }

  private pending: Promise<void> | null = null;
  private lastStep: OnboardStep | null = null;
  private stepFns: ((s: OnboardStep) => void)[] = [];
  private emit(s: OnboardStep) { this.lastStep = s; this.stepFns.forEach(f => f(s)); }
  /** Make the wallet (once), ask the sponsor for a little NEAR if it has none, and wait until the chain shows it.
   *  Only one run happens at a time: a second caller (React can start an effect twice) joins the run in progress, so a visitor is never funded twice. */
  ensureWallet(onStep: (s: OnboardStep) => void): Promise<void> {
    this.stepFns.push(onStep);
    if (this.lastStep) onStep(this.lastStep);
    if (!this.pending) this.pending = this.makeWallet().finally(() => { this.pending = null; this.stepFns = []; this.lastStep = null; });
    return this.pending;
  }
  private async makeWallet() {
    const onStep = (s: OnboardStep) => this.emit(s);
    onStep('wallet');
    if (!this.kp) {
      this.adopt(KeyPair.fromRandom('ed25519'));
      try { localStorage.setItem(this.keyName(), this.kp!.toString()); } catch { throw new Error('this browser blocks local storage, so a practice wallet cannot be saved: use your own wallet instead'); }
    }
    if ((await this.r.balanceOf(this.account!)) >= 0.15) { onStep('ready'); return; }
    onStep('funding');
    let res: Response;
    try { res = await fetch(this.cfg.fundUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account_id: this.account }) }); }
    catch { throw new Error('the practice faucet can\'t be reached: use your own wallet instead'); }
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(body.error ?? `the practice faucet answered ${res.status}: use your own wallet instead`);
    if (body.tx) this.receipts.fund = { hash: body.tx, at: Date.now() };
    onStep('waiting');
    for (let i = 0; i < 45; i++) { if ((await this.r.balanceOf(this.account!)) >= 0.15) { onStep('ready'); return; } await new Promise(r => setTimeout(r, 1000)); }
    throw new Error('the faucet payment is taking too long: try again in a moment');
  }

  async call<T>(contractId: string, method: string, args: object = {}, deposit = 0n): Promise<T> {
    if (!this.kp || !this.account) throw new Error('your practice wallet is not ready yet');
    let last: any;
    for (let i = 0; i < 3; i++) {
      try {
        const ks = new keyStores.InMemoryKeyStore(); await ks.setKey(this.cfg.networkId, this.account, this.kp);
        const near = await connect({ networkId: this.cfg.networkId, nodeUrl: this.r.nodeUrl, keyStore: ks });
        const out: any = await (await near.account(this.account)).functionCall({ contractId, methodName: method, args, gas: gasFor(method), attachedDeposit: deposit });
        this.receipts[method] = { hash: out.transaction?.hash ?? out.transaction_outcome?.id, at: Date.now() };
        this.r.clearCache();
        const v = out.status?.SuccessValue; return v ? JSON.parse(atob(v)) : (null as T);
      } catch (e: any) {
        const m = String(e?.message ?? e);
        if (/does not have enough balance|NotEnoughBalance/i.test(m)) { this.r.clearCache(); throw new Error('your practice wallet is almost out of NEAR: reset it, or use your own wallet'); }
        if (/panicked|ExecutionError|FunctionCallError/.test(m)) { this.r.clearCache(); throw new Error(panicText(e)); }
        last = e; this.r.rotate(); await new Promise(r => setTimeout(r, 500 * (i + 1)));
      }
    }
    this.r.clearCache();
    throw new Error(`the network isn't answering (${String(last?.message ?? last).slice(0, 60)}); try again`);
  }
}

class WalletNet implements Net {
  mode = 'wallet' as const;
  explorer = 'https://testnet.nearblocks.io';
  private account: string | null = null;
  private listeners: (() => void)[] = [];
  scale: Scale;
  scales: Scale[];
  private r: RpcClient;
  get nodeUrl() { return this.r.nodeUrl; }
  constructor(private factories: Partial<Record<Scale, string>>, nodeUrls: string[], private selector: WalletSelector, private modal: WalletSelectorModal) {
    this.r = new RpcClient(nodeUrls);
    this.scales = (['demo', 'real'] as Scale[]).filter(s => factories[s]);
    const want = savedScale(); this.scale = this.scales.includes(want) ? want : this.scales[0];
    const sync = () => { this.account = selector.store.getState().accounts.find(a => a.active)?.accountId ?? null; this.listeners.forEach(f => f()); };
    sync(); selector.store.observable.subscribe(sync);
  }
  get factoryId() { return this.factories[this.scale]!; }
  setScale(s: Scale) { if (this.factories[s]) { this.scale = s; try { localStorage.setItem(SCALE_KEY, s); } catch { /* ignore */ } } }
  me() { return this.account; }
  onChange(fn: () => void) { this.listeners.push(fn); }
  view<T>(contractId: string, method: string, args: object = {}) { return this.r.view<T>(contractId, method, args); }
  async call<T>(contractId: string, method: string, args: object = {}, deposit = 0n): Promise<T> {
    try { return await this.send<T>(contractId, method, args, deposit); } finally { this.r.clearCache(); }
  }
  private async send<T>(contractId: string, method: string, args: object = {}, deposit = 0n): Promise<T> {
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
  accountInfo(account: string) { return this.r.accountInfo(account); }
  balance() { return this.account ? this.r.balanceOf(this.account) : Promise.resolve(0); }
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

/** Local sandbox in dev; on a hosted testnet build `door` says whether to make a practice wallet or use the player's own wallet.
 *  VITE_NETWORK=sandbox-practice runs the practice flow against the local sandbox (for testing it without spending anything). */
export async function openNet(door?: Door | null): Promise<Net> {
  const env = envOf();
  const mode = env.VITE_NETWORK ?? (env.DEV ? 'sandbox' : 'testnet');
  if (mode === 'sandbox') return new SandboxNet(await Chain.open());
  if (mode === 'sandbox-practice') {
    const r = await fetch('/__sandbox/keys'); if (!r.ok) throw new Error('No sandbox keys. Run ./sandbox/start.sh, node sandbox/deploy.mjs and node sandbox/seed.mjs');
    const k = await r.json();
    return new GuestNet({ factoryId: k.factories.demo, nodeUrls: [k.nodeUrl], networkId: k.networkId, fundUrl: '/api/fund', explorer: null });
  }
  const factories: Partial<Record<Scale, string>> = { demo: env.VITE_FACTORY_DEMO, real: env.VITE_FACTORY_REAL };
  if (!factories.demo && !factories.real) throw new Error('Set VITE_FACTORY_DEMO and/or VITE_FACTORY_REAL to the testnet factory accounts.');
  // several public endpoints, comma separated: the app moves to the next one when one rate-limits
  const nodeUrls = String(env.VITE_NODE_URL ?? 'https://test.rpc.fastnear.com,https://rpc.testnet.near.org').split(',').map((x: string) => x.trim()).filter(Boolean);
  if (door === 'practice') {
    if (!factories.demo) throw new Error('Practice mode needs the demo factory (VITE_FACTORY_DEMO).');
    return new GuestNet({ factoryId: factories.demo, nodeUrls, networkId: 'testnet', fundUrl: env.VITE_FUND_URL ?? '/api/fund', explorer: 'https://testnet.nearblocks.io' });
  }
  const factoryId = (factories.demo ?? factories.real)!;
  const [core, ui, mnw, meteor] = await Promise.all([
    import('@near-wallet-selector/core'), import('@near-wallet-selector/modal-ui'),
    import('@near-wallet-selector/my-near-wallet'), import('@near-wallet-selector/meteor-wallet'), import('@near-wallet-selector/modal-ui/styles.css'),
  ]);
  functionCall = core.actionCreators.functionCall as any;
  toNajAction = core.internalActionToNaj as any;
  const selector = await core.setupWalletSelector({ network: 'testnet', modules: [mnw.setupMyNearWallet(), meteor.setupMeteorWallet()] });
  const modal = ui.setupModal(selector, { contractId: factoryId });
  return new WalletNet(factories, nodeUrls, selector, modal);
}
