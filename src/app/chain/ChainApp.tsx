// Rulecard app: Discover, Launch and the coin page. Every action is a real transaction (local sandbox in dev).
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toNear, toTok, nearToYocto, tokToUnits, fmtTok, fmtNear } from './near';
import { openNet, type Net } from './net';
import type {
  CoinEntry, CoinView, HolderView, Ritual, LevelView, LogEntry, HandView, Proposal, RaidView, Card, Question, Rule, BuyQuote,
} from './types';
import { TIER_OF, TIER_NAME, CARD_TEXT, RULE_TEXT, LEVEL_NAME } from './types';
import PriceChart, { type PricePoint } from './PriceChart';
import Proof from './Proof';

const MIN = 60_000, HOUR = 60 * MIN;
const dur = (ms: number) => { ms = Math.max(0, ms); const d = Math.floor(ms / (24 * HOUR)), h = Math.floor((ms % (24 * HOUR)) / HOUR), m = Math.floor((ms % HOUR) / MIN); const sec = Math.floor((ms % MIN) / 1000); return d ? `${d}d ${h}h` : h ? (m ? `${h}h ${m}m` : `${h}h`) : sec ? `${m}m ${sec}s` : `${m}m`; };
// Demo scale: game NEAR ÷100 and time ÷12. Labels that state a rule use these so they match the contract.
let NS = 1, TS = 1;
const nearAmt = (x: number) => fmtNear(x / NS);
const hrs = (h: number) => dur((h * HOUR) / TS);
const short = (a: string) => a.replace(/\.test\.near$/, '').replace(/\.rulecard$/, '');
const pct = (a: number, b: number) => (b > 0 ? Math.min(100, (a / b) * 100) : 0);
const TACTIC = ['', 'Rally', 'Curse', 'Ward'];
const tacticName = (code: number) => (code ? `${TACTIC[Math.floor(code / 10)]} ×${['1', '2', '3'][code % 10]}` : '—');

type Page = { kind: 'discover' } | { kind: 'launch' } | { kind: 'proof' } | { kind: 'coin'; id: string };
type Tab = 'trade' | 'today' | 'cards' | 'vault' | 'raid' | 'log';

export default function ChainApp() {
  const [ch, setCh] = useState<Net | null>(null);
  const [err, setErr] = useState('');
  const [me, setMe] = useState('you');
  const [page, setPage] = useState<Page>({ kind: 'discover' });
  const [coins, setCoins] = useState<CoinEntry[]>([]);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [bal, setBal] = useState(0);
  const [listErr, setListErr] = useState('');

  useEffect(() => { openNet().then(n => { n.onChange?.(() => setMe(n.me() ?? '')); setMe(n.me() ?? ''); setCh(n); }).catch(e => setErr(e.message)); }, []);
  const refresh = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => { if (!ch) return; ch.view<CoinEntry[]>(ch.factoryId, 'list_coins', {}).then(c => { setCoins(c); setListErr(''); }).catch(e => setListErr(`Can't read the factory ${ch.factoryId}: ${e.message}`)); ch.balance().then(setBal); }, [ch, tick, me]);
  useEffect(() => { const i = setInterval(refresh, ch?.mode === 'testnet' ? 10_000 : 5000); return () => clearInterval(i); }, [refresh, ch]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);

  const act = useCallback(async (label: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    try { await fn(); setToast({ ok: true, text: done ?? `${label}: done` }); }
    catch (e: any) { setToast({ ok: false, text: `${label}: ${e.message}` }); }
    finally { setBusy(''); refresh(); }
  }, [refresh]);

  if (err) return <div className="panel" style={{ margin: 16 }}><h2>Can't reach the chain</h2><p>{err}</p></div>;
  if (ch) { NS = ch.scale === 'demo' ? 100 : 1; TS = ch.scale === 'demo' ? 12 : 1; }
  if (!ch) return <div className="panel" style={{ margin: 16 }}>Connecting to the sandbox…</div>;
  const ctx = { ch, me, act, busy, tick, coins, go: setPage };

  return (
    <>
      <header className="top">
        <div className="brand">
          <button className="logo linkish" onClick={() => setPage({ kind: 'discover' })}>RULECARD</button>
          <span className="tag">memecoins with mechanics · {ch.mode}</span>
        </div>
        {ch.scales.length > 1 && <div className="seg scale" role="group" aria-label="Game scale">
          {ch.scales.map(sc => <button key={sc} aria-pressed={ch.scale === sc} title={sc === 'demo' ? 'NEAR amounts ÷100, time 12× faster: a whole game in minutes' : 'Full-size numbers, real time'} onClick={() => { ch.setScale(sc); setCoins([]); setPage({ kind: 'discover' }); refresh(); }}>{sc === 'demo' ? 'Demo' : 'Real'}</button>)}
        </div>}
        <nav className="seg" aria-label="Pages">
          <button aria-pressed={page.kind === 'discover'} onClick={() => setPage({ kind: 'discover' })}>Discover</button>
          <button aria-pressed={page.kind === 'proof'} onClick={() => setPage({ kind: 'proof' })}>Proof</button>
          <button aria-pressed={page.kind === 'launch'} onClick={() => setPage({ kind: 'launch' })}>Launch a coin</button>
        </nav>
        <div className="who">
          {ch.players ? <label className="small muted">Playing as{' '}
            <select value={ch.player} onChange={e => { ch.setPlayer!(e.target.value); setMe(ch.me() ?? ''); }}>{ch.players().map(p => <option key={p} value={p}>{p}</option>)}</select>
          </label> : me ? <span className="small">{me} <button className="btn small ghost" onClick={() => ch.signOut!().then(refresh)}>Sign out</button></span>
            : <button className="btn primary" onClick={() => ch.signIn!()}>Connect wallet</button>}
          {me && <span className="mono small">{fmtNear(bal)} NEAR</span>}
          {ch.fastForward && <span className="seg small" role="group" aria-label="Move sandbox time">
            {[[15, '+15m'], [60, '+1h'], [360, '+6h'], [1440, '+1d']].map(([m, l]) => (
              <button key={l} disabled={!!busy} onClick={() => act(`Time ${l}`, () => ch.fastForward!(m as number, coins.map(c => c.account_id)), `Moved the chain clock ${l}`)}>{l}</button>
            ))}
          </span>}
        </div>
      </header>
      {busy && <div className="busy" role="status">⏳ {busy}…</div>}
      {toast && <div className={`toast ${toast.ok ? 'ok' : 'bad'}`} role="status">{toast.text}</div>}
      <main className="page">
        {ch.scale === 'demo' && <div className="demo-banner"><strong>Demo mode</strong>: same contract rules, but every NEAR amount is ÷100 and time runs 12× faster (gm every 30 min, a Ritual day is 2h, raid rounds 100 s). Separate factory and coins. Switch to <em>Real</em> for full-size numbers.</div>}
        {listErr && <div className="warn">{listErr}</div>}
        {page.kind === 'discover' && <Discover {...ctx} />}
        {page.kind === 'launch' && <Launch {...ctx} />}
        {page.kind === 'proof' && <Proof ch={ch} coins={coins} tick={tick} />}
        {page.kind === 'coin' && <CoinPage {...ctx} id={page.id} />}
      </main>
    </>
  );
}

type Ctx = { ch: Net; me: string; act: (l: string, f: () => Promise<unknown>, d?: string) => Promise<void>; busy: string; tick: number; coins: CoinEntry[]; go: (p: Page) => void };

// ------------------------------------------------------------------ Discover
function Discover({ ch, coins, tick, go }: Ctx) {
  const [rows, setRows] = useState<Record<string, { c: CoinView; r: Ritual; raid: RaidView | null; raids: RaidView[]; gradAt: number | null }>>({});
  const [show, setShow] = useState<'live' | 'grad'>('live');
  useEffect(() => {
    (async () => {
      const out: typeof rows = {};
      for (const e of coins) {
        try {
          const [c, r, raid] = await Promise.all([ch.view<CoinView>(e.account_id, 'get_coin'), ch.view<Ritual>(e.account_id, 'get_ritual'), ch.view<RaidView | null>(e.account_id, 'get_raid')]);
          const extra = c.graduated ? await Promise.all([ch.view<RaidView[]>(e.account_id, 'get_raids'), ch.view<LogEntry[]>(e.account_id, 'get_log', { limit: 100 })]) : null;
          out[e.account_id] = { c, r, raid, raids: extra?.[0] ?? [], gradAt: extra?.[1].find(l => l.kind === 'graduated')?.at ?? null };
        } catch { /* skip */ }
      }
      setRows(out);
    })();
  }, [ch, coins, tick]);
  const loaded = coins.filter(e => rows[e.account_id]);
  const live = loaded.filter(e => !rows[e.account_id].c.graduated), grad = loaded.filter(e => rows[e.account_id].c.graduated);
  const list = show === 'live' ? live : grad;
  return (
    <section>
      <div className="row between wrap"><h1>Discover</h1>
        <div className="seg" role="group" aria-label="Which coins">
          <button aria-pressed={show === 'live'} onClick={() => setShow('live')}>Live · {live.length}</button>
          <button aria-pressed={show === 'grad'} onClick={() => setShow('grad')}>Graduated · {grad.length}</button>
        </div>
      </div>
      <p className="muted">{show === 'live' ? 'Coins still on their curve: rituals, cards and raids are on. Every coin is its own NEP-141 contract with no admin key.' : 'Hall of Fame: coins whose curve sold out. The game is over for them; their history stays on-chain. Listing on a DEX (Ref Finance) is the next step on the roadmap.'}</p>
      {!coins.length && <div className="panel">No coins yet. <button className="btn" onClick={() => go({ kind: 'launch' })}>Launch the first one</button></div>}
      {coins.length > 0 && loaded.length < coins.length && <p className="small muted">Loading {coins.length - loaded.length} more…</p>}
      {coins.length > 0 && !list.length && loaded.length === coins.length && <div className="panel muted">{show === 'live' ? 'Every coin has graduated.' : 'No coin has graduated yet: a curve sells out at ~' + nearAmt(3946) + ' NEAR.'}</div>}
      <div className="coin-grid">
        {list.map(e => {
          const { c, r, raid, raids, gradAt } = rows[e.account_id];
          if (c.graduated) {
            const won = raids.filter(x => x.result && x.result.outcome > 0).length, lost = raids.filter(x => x.result && x.result.outcome < 0).length;
            return (
              <button key={e.account_id} className="panel coin-card grad" onClick={() => go({ kind: 'coin', id: e.account_id })}>
                <div className="row between"><strong className="big">${c.symbol}</strong><span className="chip gold">🎓 Graduated</span></div>
                <div className="muted small">{c.name} · by {short(c.creator)}{gradAt ? ` · ${new Date(gradAt).toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}</div>
                <div className="row between mono"><span>{fmtNear(toNear(c.mcap))} NEAR final mcap</span><span>{c.holders} holders</span></div>
                <div className="row between small"><span>🔥 burned {fmtTok(toTok(c.burned))}</span><span>⚔ {won}W / {lost}L</span></div>
                <div className="small muted">Creator escrow {toNear(c.escrow) > 0 ? `${fmtNear(toNear(c.escrow))} N to claim` : 'paid'}</div>
              </button>
            );
          }
          const ritual = (pct(r.gm_count, r.gm_target) + pct(toNear(r.lock_near), toNear(r.lock_target))) / 2;
          return (
            <button key={e.account_id} className="panel coin-card" onClick={() => go({ kind: 'coin', id: e.account_id })}>
              <div className="row between"><strong className="big">${c.symbol}</strong><span className={`lvl l${c.level}`}>L{c.level} {LEVEL_NAME[c.level]}</span></div>
              <div className="muted small">{c.name} · by {short(c.creator)}</div>
              <div className="row between mono"><span>{fmtNear(toNear(c.mcap))} NEAR mcap</span><span>{c.holders} holders</span></div>
              <Ring value={ritual} label="Ritual" />
              <div className="chips">
                <span className="chip">⚡ {c.energy}</span><span className="chip">🜂 pot {fmtNear(toNear(c.pot))}</span>
                {raid && raid.phase === 2 && <span className="chip hot">⚔ in a raid</span>}
                {c.hype_until > c.now && <span className="chip hot">📣 Trending</span>}
                {c.rules.map(x => <span key={x} className="chip" title={RULE_TEXT[x]}>{x}</span>)}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Launch
const RULES: Rule[] = ['LaunchGuard', 'PaperTax', 'SoftTax', 'WhaleCap', 'CreatorLock', 'Ruthless', 'WarCoin', 'PeaceCoin'];
function Launch({ ch, me, act, busy, go }: Ctx) {
  const [name, setName] = useState(''); const [sym, setSym] = useState(''); const [seed, setSeed] = useState(20); const [rules, setRules] = useState<Rule[]>([]);
  const [deposit, setDeposit] = useState(5);
  const [bounds, setBounds] = useState<[number, number]>([5, 100]);
  useEffect(() => { ch.view(ch.factoryId, 'get_params').then((p: any) => { setDeposit(toNear(p.deploy_deposit)); const b: [number, number] = [toNear(p.seed_min), toNear(p.seed_max)]; setBounds(b); setSeed(s => Math.min(b[1], Math.max(b[0], s > b[1] ? b[0] * 4 : s))); }); }, [ch, ch.scale]);
  const toggle = (r: Rule) => setRules(rs => rs.includes(r) ? rs.filter(x => x !== r) : rs.length < 3 ? [...rs, r] : rs);
  const ok = name.length > 0 && /^[a-zA-Z0-9]{2,10}$/.test(sym) && seed >= bounds[0] && seed <= bounds[1] && !(rules.includes('PaperTax') && rules.includes('SoftTax'));
  return (
    <section className="narrow">
      <h1>Launch a coin</h1>
      <div className="panel stack">
        <label>Name <input value={name} maxLength={32} onChange={e => setName(e.target.value)} placeholder="Frog Pond" /></label>
        <label>Ticker <input value={sym} maxLength={10} onChange={e => setSym(e.target.value.toUpperCase())} placeholder="FROG" /></label>
        <div>
          <h3>Creator rules <span className="muted small">(up to 3, locked forever)</span></h3>
          <div className="rule-grid">{RULES.map(r => <button key={r} className="rule" aria-pressed={rules.includes(r)} onClick={() => toggle(r)}><strong>{r}</strong><span className="small muted">{RULE_TEXT[r]}</span></button>)}</div>
        </div>
        <label>Seed ({bounds[0]}–{bounds[1]} NEAR, all into the pot) <input type="number" min={bounds[0]} max={bounds[1]} step={bounds[0]} value={seed} onChange={e => setSeed(Number(e.target.value))} /></label>
        <p className="small muted">The pot is your coin's fuel for burn cards. You can't take it back. Plus {fmtNear(deposit)} NEAR for the coin contract's storage.</p>
        <p className="small">Fees: 2% per trade = 0.3% protocol · 0.2% creator escrow (paid at graduation) · 1.5% pot. <strong>No admin key: nobody can change these numbers, not even you.</strong></p>
        <button className="btn primary" disabled={!ok || !!busy} onClick={() => act('Launch', async () => {
          await ch.call(ch.factoryId, 'create_coin', { name, symbol: sym, icon: null, rules }, nearToYocto(seed + deposit));
          go({ kind: 'coin', id: ch.coinId(sym) });
        }, `$${sym} launched`)}>Launch ${sym || 'COIN'} for {fmtNear(seed + deposit)} NEAR</button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Coin page
interface CoinData { c: CoinView; h: HolderView | null; r: Ritual; lv: LevelView; hand: HandView | null; table: Proposal[]; hist: Proposal[]; raid: RaidView | null; raids: RaidView[]; log: LogEntry[]; plan: number[]; prices: PricePoint[]; }

function CoinPage(p: Ctx & { id: string }) {
  const { ch, me, act, busy, tick, id } = p;
  const [d, setD] = useState<CoinData | null>(null);
  const [tab, setTab] = useState<Tab>('trade');
  const [lockPrompt, setLockPrompt] = useState<bigint | null>(null);
  useEffect(() => {
    (async () => {
      const acc = ch.me(); const v = <T,>(m: string, a: object = {}) => ch.view<T>(id, m, a);
      const mine = <T,>(m: string): Promise<T | null> => (acc ? v<T>(m, { account_id: acc }) : Promise.resolve(null));
      const [c, h, r, lv, hand, table, hist, raid, raids, log, plan, prices] = await Promise.all([
        v<CoinView>('get_coin'), mine<HolderView>('get_holder'), v<Ritual>('get_ritual'), v<LevelView>('get_level_progress'),
        mine<HandView>('get_hand'), v<Proposal[]>('get_table'), v<Proposal[]>('get_history'), v<RaidView | null>('get_raid'), v<RaidView[]>('get_raids'),
        v<LogEntry[]>('get_log', { limit: 100 }), mine<number[]>('get_my_plan').then(x => x ?? []), v<PricePoint[]>('get_prices'),
      ]);
      setD({ c, h, r, lv, hand, table, hist, raid, raids, log, plan, prices });
    })().catch(() => {});
  }, [ch, me, id, tick]);
  if (!d) return <div className="panel">Loading…</div>;
  const { c, h } = d;
  const now = c.now;
  const tourKey = `rulecard-tour:${id}:${ch.me() ?? ''}`;
  const call = (label: string, m: string, a: object = {}, dep = 0n, done?: string) => act(label, async () => {
    const r = await ch.call(id, m, a, dep);
    const step = ({ back: 'card', sign: 'card', stoke: 'card', fuel: 'card', bet: 'card', play_card: 'card', start_raid: 'raid', sign_raid: 'raid', set_plan: 'raid', battle_cry: 'raid' } as Record<string, string>)[m];
    if (step) { try { const t = JSON.parse(localStorage.getItem(tourKey) ?? '{}'); t[step] = true; localStorage.setItem(tourKey, JSON.stringify(t)); } catch { /* ignore */ } }
    return r;
  }, done);
  const gmReady = !h || h.last_gm === 0 || now >= h.next_gm;
  const idleBurning = h && h.last_gm > 0 && now >= h.idle_burn_starts;
  const ritualPct = (pct(d.r.gm_count, d.r.gm_target) + pct(toNear(d.r.lock_near), toNear(d.r.lock_target))) / 2;
  const tabs: [Tab, string][] = [['trade', 'Trade'], ['today', 'Today'], ['cards', 'Cards'], ['vault', 'Vault'], ['raid', 'Raid'], ['log', 'Log']];
  const props = { ...p, d, now, call };

  return (
    <section>
      <div className="panel coin-head">
        <div>
          <div className="row gap"><h1>${c.symbol}</h1><span className={`lvl l${c.level}`}>L{c.level} {LEVEL_NAME[c.level]}</span>{c.graduated && <span className="chip gold">Graduated</span>}</div>
          <div className="muted small">{c.name} · by {short(c.creator)} · <span className="mono">{short(id)}</span></div>
          <div className="chips">{c.rules.map(x => <span key={x} className="chip" title={RULE_TEXT[x]}>{x}</span>)}{d.raid?.phase === 2 && <span className="chip hot">⚔ raid on</span>}{c.hype_until > now && <span className="chip hot">📣 Trending</span>}</div>
        </div>
        <div className="mono head-nums">
          <div><span className="muted small">price</span> {(toNear(c.price) * 1e6).toFixed(3)} µN</div>
          <div><span className="muted small">mcap</span> {fmtNear(toNear(c.mcap))} N</div>
          <div><span className="muted small">in curve</span> {fmtNear(toNear(c.real))} N</div>
        </div>
        <div className="head-actions">
          <button className={`btn gm ${idleBurning ? 'burning' : ''}`} disabled={!h || !gmReady || !!busy} onClick={() => call('gm', 'gm', {}, 0n, 'gm! +Energy, idle clock reset')}>
            ☀ gm{h && !gmReady ? ` in ${dur(h.next_gm - now)}` : ''}
          </button>
          <div className="small muted">{!h ? 'Buy to join' : idleBurning ? <span className="down">Idle burn running: gm to stop</span> : h.last_gm ? `idle burn starts in ${dur(h.idle_burn_starts - now)}` : `gm every ${hrs(6)}`}</div>
          {ch.enableOneTap && h && (ch.oneTapReady!(id)
            ? <span className="small up" title="gm, packs, backing and Battle cry sign without a wallet popup. Selling, locking, betting and buying still ask your wallet.">⚡ one-tap on · <button className="linkish small muted" onClick={() => act('Turn off one-tap', async () => ch.disableOneTap!(id), 'One-tap is off for this coin')}>turn off</button></span>
            : <button className="linkish small" title="One wallet approval adds a limited key for this coin: it can check in, claim packs, back cards and Battle cry. It can never sell, lock, bet or buy, and it can't touch your other tokens or NEAR." onClick={() => act('Enable one-tap', () => ch.enableOneTap!(id), 'One-tap is on for this coin')}>⚡ Enable one-tap gm</button>)}
          <button className="linkish" onClick={() => setTab('today')}><Ring value={ritualPct} label="Ritual" small /></button>
        </div>
      </div>

      {c.graduated && <div className="grad-banner">🎓 <strong>${c.symbol} graduated</strong>: its curve sold out, so buys, rituals, cards and raids are over. Holders can still sell back to the curve. The creator's escrow ({fmtNear(toNear(c.escrow))} N) is claimable now. Next on the roadmap: graduating into a Ref Finance pool.
        {ch.me() === c.creator && toNear(c.escrow) > 0 && <button className="btn small primary" disabled={!!busy} onClick={() => call('Claim escrow', 'claim_creator_escrow')}>Claim escrow</button>}</div>}
      <div className="stats">
        <Stat label="Energy" value={`${c.energy}/100`} bar={c.energy} />
        <Stat label="Pot" value={`${fmtNear(toNear(c.pot))} N`} sub={`spent today ${fmtNear(toNear(c.pot_spent_today))}`} />
        <Stat label="Vault" value={`${(pct(toTok(c.vault_locked), toTok(c.circulating))).toFixed(1)}% locked`} />
        <Stat label="Reward pool" value={fmtTok(toTok(c.reward_pool))} />
        <Stat label="Deck" value={c.deck.filter(x => x.limit).map(x => `${TIER_NAME[x.tier][0]} ${x.out}/${x.limit}`).join(' · ')} />
        <Stat label="Burned" value={fmtTok(toTok(c.burned))} sub={`supply ${fmtTok(toTok(c.total_supply))}`} />
      </div>

      <PriceChart points={d.prices} log={d.log} now={now} />

      {ch.scale === 'demo' && !c.graduated && <Tour d={d} me={ch.me()} tourKey={tourKey} go={setTab} />}

      <nav className="tabs" aria-label="Coin sections">{tabs.map(([t, l]) => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{l}</button>)}</nav>
      {lockPrompt !== null && (
        <div className="panel lock-prompt">
          <strong>Lock {hrs(24)}?</strong> Locked tokens are safe from idle burn and earn half of what idle burn takes.
          <div className="row gap"><button className="btn primary" onClick={() => { const a = lockPrompt; setLockPrompt(null); call('Lock', 'lock', { amount: a.toString(), hours: 24 }, 1n); }}>Lock {fmtTok(toTok(lockPrompt))} for {hrs(24)}</button><button className="btn" onClick={() => setLockPrompt(null)}>Not now</button></div>
        </div>
      )}
      {tab === 'trade' && <TradeTab {...props} onBought={t => setLockPrompt(t)} />}
      {tab === 'today' && <TodayTab {...props} />}
      {tab === 'cards' && <CardsTab {...props} />}
      {tab === 'vault' && <VaultTab {...props} />}
      {tab === 'raid' && <RaidTab {...props} />}
      {tab === 'log' && <LogTab {...props} />}
    </section>
  );
}

type TabProps = Ctx & { id: string; d: CoinData; now: number; call: (label: string, m: string, a?: object, dep?: bigint, done?: string) => Promise<void> };

function TradeTab({ ch, me, id, d, now, busy, act, onBought }: TabProps & { onBought: (t: bigint) => void }) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amt, setAmt] = useState(5 / NS);
  const [q, setQ] = useState<BuyQuote | null>(null);
  const [sq, setSq] = useState<any>(null);
  const { c, h, hand } = d;
  useEffect(() => {
    if (side === 'buy' && amt > 0) ch.view<BuyQuote>(id, 'quote_buy', { near: nearToYocto(amt).toString(), account_id: ch.me() }).then(setQ).catch(() => setQ(null));
    if (side === 'sell' && amt > 0) ch.view(id, 'quote_sell', { amount: tokToUnits(amt).toString(), account_id: ch.me() }).then(setSq).catch(() => setSq(null));
  }, [ch, id, me, side, amt, d]);
  const myTok = h ? toTok(h.balance) : 0;
  const locked = hand && now < hand.no_trade_until;
  return (
    <div className="grid2">
      <div className="panel stack">
        <div className="seg" role="group"><button aria-pressed={side === 'buy'} onClick={() => { setSide('buy'); setAmt(5 / NS); }}>Buy</button><button aria-pressed={side === 'sell'} onClick={() => { setSide('sell'); setAmt(Math.floor(myTok / 2)); }}>Sell</button></div>
        <label>{side === 'buy' ? 'NEAR to spend' : `Tokens to sell (you have ${fmtTok(myTok)})`}<input type="number" min={0} value={amt} onChange={e => setAmt(Number(e.target.value))} /></label>
        {side === 'buy' && q && <div className="quote mono small">≈ {fmtTok(toTok(q.tokens))} ${c.symbol} · fee {fmtNear(toNear(q.fee))} N{toNear(q.storage) > 0 ? ` · first-buy storage ${toNear(q.storage)} N` : ''} · impact {(q.impact_bps / 100).toFixed(2)}%</div>}
        {side === 'sell' && sq && <div className="quote mono small">≈ {fmtNear(toNear(sq.near_out))} NEAR · fee {fmtNear(toNear(sq.fee))}{toNear(sq.tax) > 0 ? <span className="down"> · taxes {fmtNear(toNear(sq.tax))}</span> : ''} · impact {(sq.impact_bps / 100).toFixed(2)}%</div>}
        {locked && <div className="warn">You have a live Prophecy bet: no trading until {new Date(hand!.no_trade_until).toISOString().slice(11, 16)}.</div>}
        {hand && toTok(hand.tagged) > 0 && <div className="warn">Tagged: {fmtTok(toTok(hand.tagged))} tokens bought while a pot card was on the table. Selling them before {dur(hand.tag_until - now)} pays 10% to the pot.</div>}
        {d.raid?.phase === 2 && <div className="warn">A raid is on: selling pays +3% and lowers your side's Buy score.</div>}
        {c.rules.includes('PaperTax') && <div className="small muted">Paper Tax: 10% on selling tokens bought less than {hrs(1)} ago.</div>}
        <button className="btn primary" disabled={!!busy || amt <= 0 || !!locked || (side === 'buy' && c.graduated)} onClick={() => side === 'buy'
          ? act('Buy', async () => { const t: string = await ch.call(id, 'buy', {}, nearToYocto(amt)); onBought(BigInt(t)); }, 'Bought')
          : act('Sell', () => ch.call(id, 'sell', { amount: tokToUnits(amt).toString() }, 1n), 'Sold')}>{side === 'buy' ? `Buy with ${amt} NEAR` : `Sell ${fmtTok(amt)}`}</button>
      </div>
      <div className="panel stack">
        <h2>You</h2>
        {!h ? <p className="muted">You don't hold ${c.symbol} yet.</p> : <>
          <Row k="Balance" v={`${fmtTok(myTok)} (≈ ${fmtNear(toNear(h.value))} N with locks)`} />
          <Row k="Locked in the Vault" v={fmtTok(toTok(h.locked))} />
          <Row k={`Qualified (≥ ${nearAmt(2)} NEAR for ${hrs(1)})`} v={h.qualified ? 'yes' : 'not yet'} />
          <Row k="Lost today / cap" v={`${fmtTok(toTok(h.lost_today))} / ${fmtTok(toTok(h.loss_cap_today))}`} />
          {toTok(h.pending_idle_burn) > 0 && <Row k="Idle burn due" v={<span className="down">{fmtTok(toTok(h.pending_idle_burn))}</span>} />}
        </>}
        <h3>Curve</h3>
        <Row k="Sold" v={`${(100 - pct(toTok(c.curve_room), 793_191_832)).toFixed(1)}% · graduates at ~${nearAmt(3946)} N`} />
        <Row k="Fully backed" v={c.solvent ? 'yes ✓' : 'NO'} />
      </div>
    </div>
  );
}

function TodayTab({ d, now }: TabProps) {
  const { r, lv } = d;
  const end = (r.day + 1) * 24 * HOUR;
  const nm: Record<string, string> = { market_cap: 'Market cap (NEAR)', real_near: 'Real NEAR in curve', volume_24h: 'Volume 24h (NEAR)', checkins_24h: 'Check-ins 24h', net_buying_1h: 'Net buying 1h (buys ≥ sells)', coin_age_ms: 'Coin age' };
  const val = (k: string, v: string) => k === 'checkins_24h' ? v : k === 'coin_age_ms' ? dur(Number(v)) : fmtNear(toNear(v));
  return (
    <div className="grid2">
      <div className="panel stack">
        <div className="row between"><h2>Today's Ritual</h2><span className="mono small">ends in {dur(end - now)}</span></div>
        <Bar label="gm" value={r.gm_count} max={r.gm_target} text={`${r.gm_count} / ${r.gm_target} wallets`} />
        <Bar label="Locked" value={toNear(r.lock_near)} max={toNear(r.lock_target)} text={`${fmtNear(toNear(r.lock_near))} / ${fmtNear(toNear(r.lock_target))} NEAR`} />
        <p className="small">Made it: the pot burns <strong>{r.streak >= 2 ? '7%' : '5%'}</strong> Missed: idle burn ×2 for the next {hrs(6)}.</p>
        <p className="small muted">Streak: 🔥 {r.streak} day{r.streak === 1 ? '' : 's'}{r.last_made !== null && ` · yesterday ${r.last_made ? 'made ✓' : 'missed ✗'}`}</p>
        {r.double_from.some(s => now > s && now <= s + 6 * HOUR) && <div className="warn">Ritual missed: idle burn ×2 right now.</div>}
      </div>
      <div className="panel stack">
        <div className="row between"><h2>{lv.next ? `To L${lv.next} ${LEVEL_NAME[lv.next]}` : 'Top level'}</h2>{lv.all_met_since && <span className="chip hot">hold {dur(lv.all_met_since + lv.hold_ms - now)}</span>}</div>
        {lv.rules.map(x => <div key={x.name} className={`rule-row ${x.met ? 'met' : ''}`}><span>{x.met ? '✓' : '✗'} {nm[x.name] ?? x.name}</span><span className="mono small">{val(x.name, x.current)} / {val(x.name, x.target)}</span></div>)}
      </div>
    </div>
  );
}

function CardTile({ card, count, exp, now, actions }: { card: Card; count?: number; exp?: number; now: number; actions?: ReactNode }) {
  const t = TIER_OF[card]; const info = CARD_TEXT[card];
  return (
    <div className={`card t${t}`}>
      <div className="row between small"><span className="energy">⚡{info.energy}</span><span className="muted">{info.way}</span></div>
      <div className="card-name">{info.name}{count && count > 1 ? <span className="count">×{count}</span> : null}</div>
      <div className="small tier">{TIER_NAME[t]}</div>
      <div className="small">{info.text}</div>
      {exp ? <div className={`small ${exp - now < 3 * HOUR ? 'down' : 'muted'}`}>fades in {dur(exp - now)}</div> : null}
      {actions && <div className="card-actions">{actions}</div>}
    </div>
  );
}

function CardsTab({ ch, me, id, d, now, busy, call }: TabProps) {
  const { hand, c } = d;
  const [q, setQ] = useState<'Tide' | 'Line' | 'Crowd' | 'Vault'>('Tide');
  const [qv, setQv] = useState(7);
  const commons = hand ? hand.commons.filter(([, n]) => n > 0) : [];
  const held = commons.reduce((a, [, n]) => a + n, 0);
  const question = (): Question => q === 'Tide' ? 'Tide' : q === 'Line' ? { Line: { price: ((BigInt(c.price) * BigInt(100 + qv)) / 100n).toString() } } : q === 'Crowd' ? { Crowd: { n: qv } } : { Vault: { bps: qv * 100 } };
  const play = (card: Card) => card === 'Prophecy' ? call('Play Prophecy', 'play_card', { card, question: question() }) : call(`Play ${CARD_TEXT[card].name}`, 'play_card', { card, question: null });
  const levelDrops = [2, 3, 4].filter(l => l <= c.level && hand && !(hand.drops_claimed & (1 << l)));
  return (
    <div className="stack">
      <div className="panel row between wrap">
        <div className="small">{hand ? <>Commons {held}/12 · Rares {hand.cards.filter(x => TIER_OF[x.card] === 1).length}/3 · Epics {hand.cards.filter(x => TIER_OF[x.card] === 2).length}/3</> : 'Buy to collect cards'}</div>
        <div className="row gap">
          {levelDrops.map(l => <button key={l} className="btn" disabled={!!busy} onClick={() => call(`L${l} drop`, 'claim_level_drop', { level: l })}>Claim L{l} drop</button>)}
          <button className="btn primary" disabled={!hand || !!busy || now < (hand?.next_pack ?? 0)} onClick={() => call('Claim pack', 'claim_pack', {}, 0n, 'Pack opened')}>
            {hand && now < hand.next_pack ? `Next pack in ${dur(hand.next_pack - now)}` : 'Claim pack'}
          </button>
        </div>
      </div>
      {hand && hand.cut_used > 0 && <p className="small muted">Helping cut {dur(hand.cut_used)} off this pack's wait (max {hrs(1)}).</p>}
      <div className="panel">
        <h2>Your hand</h2>
        {!commons.length && !hand?.cards.length && <p className="muted">No cards yet: gm, then claim a pack.</p>}
        <div className="hand">
          {commons.map(([card, n]) => <CardTile key={card} card={card} count={n} now={now} actions={['Ember', 'RollCall', 'HypeSiren'].includes(card) ? <>
            <button className="btn small" disabled={!!busy} onClick={() => play(card)}>Play</button>
            <button className="btn small ghost" disabled={!!busy} onClick={() => call('Drop', 'drop_card', { card })}>Drop</button></> : <button className="btn small ghost" disabled={!!busy} onClick={() => call('Drop', 'drop_card', { card })}>Drop</button>} />)}
          {hand?.cards.map((x, i) => <CardTile key={i} card={x.card} exp={x.exp} now={now} actions={<>
            {x.card === 'Prophecy' && <div className="stack small">
              <select value={q} onChange={e => setQ(e.target.value as any)}><option value="Tide">Tide: net buying in 2h?</option><option value="Line">Line: price above +X% in 2h?</option><option value="Crowd">Crowd: N new buyers (≥ 1 NEAR)?</option><option value="Vault">Vault: locked share +X points?</option></select>
              {q !== 'Tide' && <input className="tiny" type="number" value={qv} onChange={e => setQv(Number(e.target.value))} title={q === 'Line' ? '5–10 (%) above, or -10 to -5 below' : q === 'Crowd' ? '3–30 wallets' : '1–10 points'} />}
            </div>}
            <button className="btn small" disabled={!!busy} onClick={() => play(x.card)}>Play</button>
            <button className="btn small ghost" disabled={!!busy} onClick={() => call('Drop', 'drop_card', { card: x.card })}>Drop</button></>} />)}
        </div>
      </div>
      <div className="panel">
        <h2>Table</h2>
        {!d.table.length && <p className="muted small">Nothing on the table. Cards that need backers or signers show here.</p>}
        {d.table.map(t => <TableRow key={t.id} t={t} now={now} me={(ch.me() ?? '')} busy={busy} call={call} />)}
        {!!d.hist.length && <><h3>Recent</h3>{d.hist.slice().reverse().map(t => <div key={t.id} className="small row between"><span>{CARD_TEXT[t.card].name} by {short(t.proposer)}</span><span className="muted">{t.result}</span></div>)}</>}
      </div>
    </div>
  );
}

function TableRow({ t, now, me, busy, call }: { t: Proposal; now: number; me: string; busy: string; call: TabProps['call'] }) {
  const [amt, setAmt] = useState(t.card === 'Ember' ? 2 / NS : 5 / NS);
  const [yes, setYes] = useState(true);
  const phaseName = t.phase === 0 ? (t.card === 'Inferno' ? 'signing' : 'backing') : t.phase === 1 ? (t.card === 'Prophecy' ? 'betting' : 'fuel window') : t.card === 'Prophecy' ? 'waiting for the answer' : 'fires within 2 min';
  const mine = t.backers.includes(me) || t.proposer === me;
  const yesT = t.bets.filter(b => b.yes).reduce((a, b) => a + toTok(b.amount), 0), noT = t.bets.filter(b => !b.yes).reduce((a, b) => a + toTok(b.amount), 0);
  return (
    <div className={`table-row t${TIER_OF[t.card]}`}>
      <div className="row between wrap">
        <strong>{CARD_TEXT[t.card].name}</strong>
        <span className="small muted">by {short(t.proposer)} · {phaseName} · {dur(t.phase_end - now)}</span>
      </div>
      {t.question && <div className="small">Q: {typeof t.question === 'string' ? 'Will the coin be a net buyer over 2h?' : 'Line' in t.question ? `Price above ${(toNear(t.question.Line.price) * 1e6).toFixed(3)} µN?` : 'Crowd' in t.question ? `${t.question.Crowd.n}+ new buyers (≥ 1 NEAR each)?` : `Vault share +${t.question.Vault.bps / 100} points?`}</div>}
      {t.phase === 0 && <div className="row gap small"><Bar label={t.card === 'Inferno' ? 'signers' : t.card === 'Ember' ? 'copies' : 'backers'} value={t.backers.length} max={t.needed} text={`${t.backers.length}/${t.needed}`} />
        {!mine && <button className="btn small" disabled={!!busy} onClick={() => call(t.card === 'Inferno' ? 'Sign' : 'Back', t.card === 'Inferno' ? 'sign' : 'back', { id: t.id }, 0n, 'Thanks: your next pack comes 10 min sooner')}>{t.card === 'Inferno' ? 'Sign' : t.card === 'Ember' ? 'Add my Ember' : 'Back'}</button>}</div>}
      {t.card === 'Ember' && t.phase === 0 && <div className="row gap small">Stoke: <input className="tiny" type="number" value={amt} onChange={e => setAmt(Number(e.target.value))} /> NEAR (max {nearAmt(5)}) <button className="btn small" disabled={!!busy} onClick={() => call('Stoke', 'stoke', { id: t.id }, nearToYocto(amt))}>Stoke</button> <span className="muted">stoked {fmtNear(toNear(t.chip_total))}</span></div>}
      {t.card === 'Inferno' && t.phase === 1 && <div className="row gap small">Fuel: <input className="tiny" type="number" value={amt} onChange={e => setAmt(Number(e.target.value))} /> NEAR (max {nearAmt(20)}) <button className="btn small" disabled={!!busy} onClick={() => call('Fuel', 'fuel', { id: t.id }, nearToYocto(amt), `Fuelled: locked ${hrs(24)} with +5%`)}>Fuel</button> <span className="muted">{fmtNear(toNear(t.chip_total))} N from {t.chips.length} wallets</span></div>}
      {t.card === 'Prophecy' && t.phase >= 1 && <div className="row gap small wrap">
        <span>Yes {fmtTok(yesT)} · No {fmtTok(noT)} · {new Set(t.bets.map(b => b.account)).size} wallets (min 8)</span>
        {t.phase === 1 && <><select value={yes ? 'y' : 'n'} onChange={e => setYes(e.target.value === 'y')}><option value="y">Yes</option><option value="n">No</option></select>
          <input className="tiny" type="number" value={amt} onChange={e => setAmt(Number(e.target.value))} title="tokens (thousands)" />k tokens
          <button className="btn small" disabled={!!busy} onClick={() => call('Bet', 'bet', { id: t.id, yes, amount: tokToUnits(amt * 1000).toString() }, 1n, 'Bet placed: no trading until it resolves')}>Bet</button></>}
      </div>}
    </div>
  );
}

function VaultTab({ d, now, busy, call }: TabProps) {
  const { h, c } = d;
  const [amt, setAmt] = useState(0); const [hours, setHours] = useState(24);
  if (!h) return <div className="panel muted">Buy to use the Vault.</div>;
  return (
    <div className="grid2">
      <div className="panel stack">
        <h2>Lock</h2>
        <p className="small muted">Locked tokens can't be sold. They're safe from idle burn and earn half of everything idle burn and early exits take, by weight.</p>
        <label>Tokens (you have {fmtTok(toTok(h.balance))}) <input type="number" value={amt} onChange={e => setAmt(Number(e.target.value))} /></label>
        <div className="seg" role="group">{[6, 24, 72].map(x => <button key={x} aria-pressed={hours === x} onClick={() => setHours(x)}>{hrs(x)} ×{x === 6 ? '1' : x === 24 ? '1.5' : '2'}</button>)}</div>
        <div className="row gap"><button className="btn ghost small" onClick={() => setAmt(Math.floor(toTok(h.balance)))}>All</button>
          <button className="btn primary" disabled={!!busy || amt <= 0} onClick={() => call('Lock', 'lock', { amount: tokToUnits(amt).toString(), hours }, 1n, `Locked for ${hrs(hours)}`)}>Lock {fmtTok(amt)} for {hrs(hours)}</button></div>
        <h3>Coin Vault</h3>
        <Row k="Locked" v={`${fmtTok(toTok(c.vault_locked))} (${pct(toTok(c.vault_locked), toTok(c.circulating)).toFixed(1)}% of circulating)`} />
      </div>
      <div className="panel stack">
        <h2>Your locks</h2>
        {!h.locks.length && <p className="muted small">No locks.</p>}
        {h.locks.map((l, i) => <div key={i} className="row between lock-row">
          <span className="mono">{fmtTok(toTok(l.amount))} ×{l.mult / 10}</span>
          {now >= l.until ? <button className="btn small primary" disabled={!!busy} onClick={() => call('Unlock', 'unlock', { index: i })}>Unlock</button>
            : <span className="row gap small"><span className="muted">{dur(l.until - now)}</span><button className="btn small danger" disabled={!!busy} onClick={() => call('Leave early', 'leave_early', { index: i }, 1n, 'Left early: 20% penalty')}>Leave early (−20%)</button></span>}
        </div>)}
        <Row k="Earned so far" v={fmtTok(toTok(h.vault_earned))} />
        <button className="btn" disabled={!!busy || toTok(h.vault_earned) <= 0} onClick={() => call('Claim', 'claim_vault')}>Claim earnings</button>
        <h3>Idle burn</h3>
        <Row k="Last gm" v={h.last_gm ? `${dur(now - h.last_gm)} ago` : 'never'} />
        <Row k="Burn starts" v={now >= h.idle_burn_starts ? <span className="down">running (1% every {hrs(6)})</span> : `in ${dur(h.idle_burn_starts - now)}`} />
        <Row k="Lost today / 8% cap" v={`${fmtTok(toTok(h.lost_today))} / ${fmtTok(toTok(h.loss_cap_today))}`} />
      </div>
    </div>
  );
}

function RaidTab({ ch, id, d, now, busy, call, coins, act, me }: TabProps) {
  const { raid, c, hand } = d;
  const [target, setTarget] = useState('');
  const others = coins.filter(x => x.account_id !== id);
  const [slots, setSlots] = useState<(Card | null)[]>([null, null, null]);
  useEffect(() => { setSlots(d.plan.length === 3 ? d.plan.map(x => (x ? (['Rally', 'Curse', 'Ward'][x - 1] as Card) : null)) : [null, null, null]); }, [d.plan.join()]);
  const tactics = hand ? hand.commons.filter(([k]) => ['Rally', 'Curse', 'Ward'].includes(k)) : [];
  const roundStart = (i: number) => raid ? raid.muster_end + i * 25 * MIN : 0;
  const phase = raid ? (raid.phase === 0 ? 'signing' : raid.phase === 1 ? 'waiting for the target' : raid.phase === 3 ? 'settling' : now < raid.muster_end ? `Muster: ${dur(raid.muster_end - now)}` : raid.round !== null ? `Round ${raid.round + 1}: ${dur(roundStart(raid.round) + 20 * MIN - now)}` : now >= raid.end ? 'over: settle it' : 'break') : '';
  const other = raid ? (raid.attacking ? raid.defender : raid.attacker) : '';
  return (
    <div className="stack">
      {!raid && <div className="panel stack">
        <h2>Start a raid</h2>
        <p className="small muted">Needs {[0, 0, 3, 5, 8][c.level] || 3} signers at L{c.level}. No card, no Energy. The target can't decline if it's the same level or higher, not shielded and not near graduation.</p>
        <div className="row gap"><select value={target} onChange={e => setTarget(e.target.value)}><option value="">Pick a coin…</option>{others.map(o => <option key={o.account_id} value={o.account_id}>${o.symbol}</option>)}</select>
          <button className="btn primary" disabled={!target || !!busy || c.level < 2} onClick={() => call('Propose raid', 'start_raid', { target })}>Propose raid</button></div>
        {c.level < 2 && <p className="small down">Raids start at L2.</p>}
      </div>}
      {raid && <div className="panel stack">
        <div className="row between wrap"><h2>{raid.attacking ? `$${c.symbol} ⚔ ${short(other).split('.')[0].toUpperCase()}` : `${short(other).split('.')[0].toUpperCase()} ⚔ $${c.symbol}`}</h2><span className="chip hot">{phase}</span></div>
        {raid.phase === 0 && <div className="row gap"><Bar label="signers" value={raid.backers} max={raid.needed} text={`${raid.backers}/${raid.needed}`} />
          <button className="btn" disabled={!!busy} onClick={() => call('Sign raid', 'sign_raid')}>Sign</button>
          <button className="btn primary" disabled={!!busy} onClick={() => call('Launch raid', 'launch_raid', {}, 0n, 'Raid sent to the target')}>Launch</button></div>}
        {raid.phase === 2 && <>
          <div className="rounds">{[0, 1, 2].map(i => <div key={i} className={`round ${raid.round === i ? 'live' : ''}`}>
            <div className="small muted">Round {i + 1}</div>
            <div className="mono">{(Number(raid.live_base[i]) / 100).toFixed(1)}</div>
            <div className="small">Buy {(raid.buy[i] / 100).toFixed(1)} · Crowd {raid.crowd[i]} · Lock {(raid.lock[i] / 100).toFixed(1)}</div>
            <div className="small">{raid.tactic[i] ? `tactic: ${tacticName(raid.tactic[i])}` : 'tactic hidden'}</div>
          </div>)}</div>
          <h3>Your plan <span className="muted small">({raid.planners} wallets have plans)</span></h3>
          <div className="row gap wrap">{slots.map((s, i) => <label key={i} className="small">R{i + 1}{' '}
            <select disabled={now >= roundStart(i)} value={s ?? ''} onChange={e => setSlots(x => x.map((y, j) => (j === i ? ((e.target.value || null) as Card | null) : y)))}>
              <option value="">empty</option>{['Rally', 'Curse', 'Ward'].map(k => <option key={k} value={k}>{k}</option>)}
            </select></label>)}
            <button className="btn" disabled={!!busy} onClick={() => call('Save plan', 'set_plan', { slots })}>Save plan</button>
            <span className="small muted">In hand: {tactics.map(([k, n]) => `${k} ×${n}`).join(', ') || 'none'}</span></div>
          <div className="row gap"><button className="btn primary" disabled={!!busy || raid.round === null} onClick={() => call('Battle cry', 'battle_cry', {}, 0n, 'Battle cry! +Crowd')}>📯 Battle cry</button>
            {now >= raid.end && raid.attacking && <button className="btn" disabled={!!busy} onClick={() => call('Settle', 'settle_raid', {}, 0n, 'Raid settled')}>Settle raid</button>}
            {now >= raid.end && !raid.attacking && <button className="btn" disabled={!!busy} onClick={() => act('Settle', () => ch.call(other, 'settle_raid'), 'Raid settled')}>Settle raid</button>}</div>
        </>}
      </div>}
      {!!d.raids.length && <div className="panel"><h2>Past raids</h2>{d.raids.slice().reverse().map(r => <div key={r.seq} className="row between small past-raid">
        <span>{r.attacking ? `attacked ${short(r.defender).split('.')[0].toUpperCase()}` : `defended vs ${short(r.attacker).split('.')[0].toUpperCase()}`}</span>
        <span>{r.result ? <><strong className={r.result.outcome > 0 ? 'up' : r.result.outcome < 0 ? 'down' : ''}>{r.result.outcome > 0 ? 'won' : r.result.outcome < 0 ? 'lost' : 'tie'}</strong> · spoils {fmtNear(toNear(r.result.spoils))} N · tactics {r.tactic.map(tacticName).join(' / ')}</> : r.note}</span>
        {r.result && r.result.outcome > 0 && <button className="btn small" disabled={!!busy} onClick={() => call('Win pack', 'claim_raid_pack', {}, 0n, 'Win pack opened')}>Claim win pack</button>}
      </div>)}</div>}
    </div>
  );
}

function LogTab({ d }: TabProps) {
  const { c, log } = d;
  const [f, setF] = useState<'mb' | 'all'>('mb');
  const rows = useMemo(() => log.filter(e => f === 'all' || ['mint', 'burn', 'to_vault'].includes(e.kind)), [log, f]);
  return (
    <div className="panel">
      <div className="row between wrap"><h2>Every mint and burn</h2><div className="seg small" role="group"><button aria-pressed={f === 'mb'} onClick={() => setF('mb')}>Mints & burns</button><button aria-pressed={f === 'all'} onClick={() => setF('all')}>Everything</button></div></div>
      <p className="mono small">Total supply 1,000,000,000 → {Math.round(toTok(c.total_supply)).toLocaleString()} (−{(toTok(c.burned) / 1e7).toFixed(3)}%)</p>
      <table className="log"><thead><tr><th>Time (UTC)</th><th>What</th><th>Tokens</th><th>NEAR</th><th>Who / why</th></tr></thead>
        <tbody>{rows.map(e => <tr key={e.seq} className={e.kind}>
          <td className="mono">{new Date(e.at).toISOString().slice(5, 16).replace('T', ' ')}</td>
          <td>{({ mint: '🌱 mint', burn: '🔥 burn', to_vault: '🔒 to Vault', buy: 'buy', sell: 'sell', lock: 'lock', unlock: 'unlock', card: '🃏 card', raid: '⚔ raid', ritual_made: '🕯 ritual made', ritual_missed: 'ritual missed', level_up: '⬆ level', seed: 'seed', graduated: '🎓 graduated' } as Record<string, string>)[e.kind] ?? e.kind}</td>
          <td className="mono">{toTok(e.amount) ? fmtTok(toTok(e.amount)) : ''}</td>
          <td className="mono">{toNear(e.near) ? fmtNear(toNear(e.near)) : ''}</td>
          <td className="small">{e.account ? short(e.account) : ''} {e.memo}</td>
        </tr>)}</tbody></table>
      <p className="small muted">Also emitted as NEP-297 events (nep141 ft_mint / ft_burn / ft_transfer and rulecard game events) for any indexer.</p>
    </div>
  );
}

// ------------------------------------------------------------------ Demo tour
function Tour({ d, me, tourKey, go }: { d: CoinData; me: string | null; tourKey: string; go: (t: Tab) => void }) {
  const [open, setOpen] = useState(true);
  let flags: Record<string, boolean> = {};
  try { flags = JSON.parse(localStorage.getItem(tourKey) ?? '{}'); } catch { /* ignore */ }
  const { h, hand } = d;
  const mine = (p: Proposal) => !!me && (p.proposer === me || p.backers.includes(me) || p.chips.some(x => x.account === me) || p.bets.some(b => b.account === me));
  const steps: [string, boolean, Tab, string][] = [
    ['Buy some tokens', !!h && (toTok(h.balance) > 0 || toTok(h.locked) > 0), 'trade', 'Trade tab: a demo buy costs cents'],
    ['Say gm', !!h && h.last_gm > 0, 'trade', 'the ☀ gm button in the header: +Energy and your idle clock resets'],
    ['Lock in the Vault', !!h && h.locks.length > 0, 'vault', 'Vault tab: locked tokens are safe from idle burn and earn from it'],
    ['Claim a pack', !!hand && hand.next_pack > 0, 'cards', 'Cards tab: 2 cards every 30 min after a gm'],
    ['Back, sign or play a card', !!flags.card || [...d.table, ...d.hist].some(mine), 'cards', 'Cards tab: back a card on the Table, fuel an Inferno, bet on a Prophecy or play one of yours'],
    ['Join a raid', !!flags.raid || d.plan.some(x => x > 0), 'raid', 'Raid tab: sign a raid, fill your 3-slot plan or Battle cry in a round'],
  ];
  const done = steps.filter(x => x[1]).length;
  return (
    <div className="panel tour">
      <button className="linkish row between tour-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <strong>Demo tour · {done}/{steps.length}</strong><span className="small muted">{done === steps.length ? 'all done: every step is a real transaction on-chain' : open ? 'hide' : 'show'}</span>
      </button>
      {open && <ol className="tour-steps">{steps.map(([t, ok, tab, hint]) => (
        <li key={t} className={ok ? 'ok' : ''}><span>{ok ? '✓' : '○'} {t}</span>{!ok && <button className="linkish small" onClick={() => go(tab)}>{hint} →</button>}</li>
      ))}</ol>}
    </div>
  );
}

// ------------------------------------------------------------------ small pieces
function Ring({ value, label, small }: { value: number; label: string; small?: boolean }) {
  const r = small ? 16 : 22, c = 2 * Math.PI * r, s = small ? 40 : 54;
  return (
    <span className="ring-wrap" title={`${label}: ${value.toFixed(0)}%`}>
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
        <circle cx={s / 2} cy={s / 2} r={r} className="ring-bg" />
        <circle cx={s / 2} cy={s / 2} r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform={`rotate(-90 ${s / 2} ${s / 2})`} />
      </svg>
      <span className="small">{label} {value.toFixed(0)}%</span>
    </span>
  );
}
function Stat({ label, value, sub, bar }: { label: string; value: string; sub?: string; bar?: number }) {
  return <div className="stat"><div className="small muted">{label}</div><div className="mono">{value}</div>{bar !== undefined && <div className="meter"><i style={{ width: `${bar}%` }} /></div>}{sub && <div className="small muted">{sub}</div>}</div>;
}
function Bar({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  return <div className="bar"><span className="small">{label}</span><div className="meter"><i style={{ width: `${pct(value, max)}%` }} /></div><span className="mono small">{text}</span></div>;
}
function Row({ k, v }: { k: string; v: ReactNode }) { return <div className="row between small"><span className="muted">{k}</span><span className="mono">{v}</span></div>; }
